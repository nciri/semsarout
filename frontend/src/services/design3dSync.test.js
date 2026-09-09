import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as local from './design3dLocal'
import { newId } from '../utils/floorplan'
import { applyLocal, runOnce, refreshFromServer, startEngine } from './design3dSync'

const lvl = (over = {}) => ({ id: 'l'.repeat(32), project_id: 'p'.repeat(32), name: 'RDC', position: 0, revision: 0,
  wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false, ...over })

function fakeApi(overrides = {}) {
  return {
    // Le serveur crée le niveau initial avec SON propre UUID (main.py::create_project) :
    // le double doit donc en tirer un au hasard. Un id fixe, égal à celui qu'utilisent
    // les autres tests, masquerait toute divergence entre l'id local et l'id serveur.
    createProject: vi.fn(async (p) => ({ ...p, levels: [lvl({ id: newId(), project_id: p.id })] })),
    updateLevel: vi.fn(async (id, body) => ({ ...lvl(), revision: body.base_revision + 1, shelved: false })),
    updateProject: vi.fn(async (id, p) => ({ id, ...p })),
    sync: vi.fn(async () => ({ projects: [] })),
    getProject: vi.fn(async () => ({ id: 'p'.repeat(32), levels: [lvl({ revision: 3 })] })),
    ...overrides,
  }
}

beforeEach(async () => { await local.clearAll() })

describe('design3d sync engine', () => {
  it('applyLocal writes locally before any network call', async () => {
    const api = fakeApi()
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    expect((await local.getLevel(lvl().id)).dirty).toBe(true)
    expect(api.updateLevel).not.toHaveBeenCalled()
    expect(await local.pendingCount()).toBe(1)
  })

  it('replays outbox in order and removes ops only after success', async () => {
    const calls = []
    const api = fakeApi({
      createProject: vi.fn(async (p) => { calls.push('create'); return { ...p, levels: [lvl()] } }),
      updateLevel: vi.fn(async () => { calls.push('update'); return { ...lvl(), revision: 1, shelved: false } }),
    })
    await applyLocal({ type: 'project.create', payload: { id: 'p'.repeat(32), target_type: 'property', target_id: 1, title: 'A' } }, { local })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    expect(calls).toEqual(['create', 'update'])
    expect(r).toMatchObject({ synced: 2, pending: 0 })
    expect((await local.getLevel(lvl().id)).revision).toBe(1)
    expect((await local.getLevel(lvl().id)).dirty).toBe(false)
  })

  it('keeps the op and backs off on network error', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw Object.assign(new Error('net'), { code: 'ERR_NETWORK' }) }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    const r = await runOnce({ api, local, onState: (s) => states.push(s.state) })
    expect(r.pending).toBe(1)
    expect(states.at(-1)).toBe('offline')
    expect(r.retryInMs).toBeGreaterThan(0)
  })

  it('keeps a project creation refused with 503 in the queue instead of losing it', async () => {
    const api = fakeApi({
      createProject: vi.fn(async () => { throw { response: { status: 503, data: { error: 'Vérification de la cible indisponible' } } } }),
    })
    await applyLocal({ type: 'project.create', payload: { id: 'p'.repeat(32), target_type: 'property', target_id: 1, title: 'A' } }, { local })
    const states = []
    const r = await runOnce({ api, local, onState: (s) => states.push(s.state) })
    expect(r.pending).toBe(1)
    expect(states.at(-1)).toBe('offline')
    expect((await local.getProject('p'.repeat(32))).sync_error).toBeUndefined()
  })

  it('stops on 401 keeping the queue', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 401 } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    await runOnce({ api, local, onState: (s) => states.push(s.state) })
    expect(states.at(-1)).toBe('auth_expired')
    expect(await local.pendingCount()).toBe(1)
  })

  it('409 replaces local level with server version and flags conflict', async () => {
    const server = lvl({ revision: 5, name: 'Serveur' })
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 409, data: { level: server } } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    await runOnce({ api, local, onState: (s) => states.push(s) })
    expect((await local.getLevel(lvl().id)).name).toBe('Serveur')
    expect(await local.pendingCount()).toBe(0)
    expect(states.at(-1).state).toBe('conflict')
  })

  it('owner shelved response flags conflict but keeps own version', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => ({ ...lvl(), revision: 7, shelved: true })) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    await runOnce({ api, local, onState: (s) => states.push(s) })
    expect(states.at(-1).state).toBe('conflict')
    expect((await local.getLevel(lvl().id)).revision).toBe(7)
  })

  it('offline-created project keeps its id after sync', async () => {
    const api = fakeApi()
    await applyLocal({ type: 'project.create', payload: { id: 'p'.repeat(32), target_type: 'property', target_id: 1, title: 'A' } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect(api.createProject.mock.calls[0][0].id).toBe('p'.repeat(32))
    expect((await local.getProject('p'.repeat(32))).synced).toBe(true)
  })

  it('the drawing made on the initial level of a freshly created project reaches the server', async () => {
    const pid = 'p'.repeat(32)
    const geometry = { walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness_m: 0.2 }], rooms: [], openings: [] }
    let serverLevelId
    const api = fakeApi({
      createProject: vi.fn(async (p) => {
        serverLevelId = newId()
        return { ...p, levels: [lvl({ id: serverLevelId, project_id: p.id })] }
      }),
      // Le serveur ne connaît que les niveaux qu'il a lui-même créés : tout autre
      // identifiant est un 404 (main.py::_load_level).
      updateLevel: vi.fn(async (id, body) => {
        if (id !== serverLevelId) throw { response: { status: 404, data: { error: 'Not found' } } }
        return { ...lvl({ id, project_id: pid }), ...body, revision: body.base_revision + 1, shelved: false }
      }),
    })

    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    const [seeded] = await local.listLevels(pid)
    await applyLocal({ type: 'level.update', payload: { id: seeded.id, geometry } }, { local })
    await runOnce({ api, local, onState: () => {} })

    // Le dessin doit avoir atteint le serveur, sous l'identifiant que LE SERVEUR
    // a attribué au niveau initial.
    expect(api.updateLevel).toHaveBeenCalledTimes(1)
    expect(api.updateLevel.mock.calls[0][0]).toBe(serverLevelId)
    expect(api.updateLevel.mock.calls[0][1].geometry).toEqual(geometry)
    const stored = await local.getLevel(seeded.id)
    expect(stored.geometry).toEqual(geometry)
    expect(stored.dirty).toBe(false)
    expect(stored.sync_error).toBeUndefined()
    expect(await local.pendingCount()).toBe(0)
  })

  it('a background refresh after a project creation does not duplicate the initial level', async () => {
    const pid = 'p'.repeat(32)
    let serverLevelId
    const api = fakeApi({
      createProject: vi.fn(async (p) => {
        serverLevelId = newId()
        return { ...p, levels: [lvl({ id: serverLevelId, project_id: p.id })] }
      }),
    })
    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    await runOnce({ api, local, onState: () => {} })

    api.sync = vi.fn(async () => ({ projects: [{ id: pid, levels: [{ id: serverLevelId, revision: 4, shelved_count: 0 }] }] }))
    api.getProject = vi.fn(async () => ({ id: pid, levels: [lvl({ id: serverLevelId, project_id: pid, revision: 4, name: 'RDC' })] }))
    await refreshFromServer({ api, local })

    const levels = await local.listLevels(pid)
    expect(levels).toHaveLength(1)
    expect(levels[0].revision).toBe(4)
  })

  it('refreshFromServer adopts the initial level instead of duplicating it when creation already landed server-side but adoption has not happened yet (second tab / in-flight creation)', async () => {
    const pid = 'p'.repeat(32)
    const serverLevelId = newId()
    // Le projet a été créé localement, mais `runOnce` n'a jamais tourné : le
    // niveau initial est encore `seeded` et sans `server_id`, exactement comme
    // si la réponse de `POST /projects` était encore en vol, ou comme si ce
    // rafraîchissement venait d'un second onglet.
    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    const api = fakeApi({
      sync: vi.fn(async () => ({ projects: [{ id: pid, levels: [{ id: serverLevelId, revision: 0, shelved_count: 0 }] }] })),
      getProject: vi.fn(async () => ({ id: pid, levels: [lvl({ id: serverLevelId, project_id: pid, revision: 0 })] })),
    })
    await refreshFromServer({ api, local })
    const levels = await local.listLevels(pid)
    // Sans le rattrapage, le niveau serveur serait inséré comme un second
    // enregistrement local (le double « RDC » indiscernable de C1, par une
    // autre porte).
    expect(levels).toHaveLength(1)
    expect(levels[0].server_id).toBe(serverLevelId)
    expect(levels[0].seeded).toBe(true)
  })

  it('refreshFromServer reloads non-dirty levels whose revision advanced', async () => {
    await local.putLevel(lvl({ revision: 1 }))
    const api = fakeApi({ sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 3, shelved_count: 0 }] }] })) })
    await refreshFromServer({ api, local })
    expect((await local.getLevel(lvl().id)).revision).toBe(3)
  })

  it('refreshFromServer leaves dirty levels alone', async () => {
    await local.putLevel(lvl({ revision: 1, dirty: true, name: 'Local' }))
    const api = fakeApi({ sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 3, shelved_count: 0 }] }] })) })
    await refreshFromServer({ api, local })
    expect((await local.getLevel(lvl().id)).name).toBe('Local')
  })

  it('422 persists the error on the local level, unblocks it and exposes a distinct state', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 422, data: { error: 'Géométrie invalide' } } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    const r = await runOnce({ api, local, onState: (s) => states.push(s) })
    expect(await local.pendingCount()).toBe(0)
    const stored = await local.getLevel(lvl().id)
    expect(stored.dirty).toBe(false)
    expect(stored.sync_error).toMatchObject({ code: 422, message: 'Géométrie invalide' })
    expect(stored.sync_error.at).toEqual(expect.any(Number))
    expect(states.at(-1).state).toBe('error')
    expect(r.hasError).toBe(true)
  })

  it('403 also persists the error on the local level and removes the op', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 403, data: { error: 'Interdit' } } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect((await local.getLevel(lvl().id)).sync_error).toMatchObject({ code: 403 })
    expect(await local.pendingCount()).toBe(0)
  })

  it('404 also persists the error on the local level and removes the op', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 404, data: { error: 'Introuvable' } } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect((await local.getLevel(lvl().id)).sync_error).toMatchObject({ code: 404 })
    expect(await local.pendingCount()).toBe(0)
  })

  it('keeps processing later ops in the queue after a non-retryable error on an earlier one', async () => {
    const otherId = 'o'.repeat(32)
    const calls = []
    const api = fakeApi({
      updateLevel: vi.fn(async (id) => {
        calls.push(id)
        if (id === lvl().id) throw { response: { status: 422, data: { error: 'invalide' } } }
        return { ...lvl({ id }), revision: 1, shelved: false }
      }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await applyLocal({ type: 'level.update', payload: { id: otherId, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    expect(calls).toEqual([lvl().id, otherId])
    expect(r.synced).toBe(1)
    const other = await local.getLevel(otherId)
    expect(other.dirty).toBe(false)
    expect(other.revision).toBe(1)
  })

  it('only sends one request for two consecutive edits of the same level queued before sync', async () => {
    const api = fakeApi()
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    expect(api.updateLevel).toHaveBeenCalledTimes(1)
    expect(api.updateLevel.mock.calls[0][1].name).toBe('V2')
    expect(r.synced).toBe(2)
    expect(await local.pendingCount()).toBe(0)
  })

  it('an edit applied while a request is in flight is sent to the server, never silently dropped, when that request fails', async () => {
    let calls = 0
    const api = fakeApi({
      updateLevel: vi.fn(async (id, body) => {
        calls++
        if (calls === 1) {
          // Simule l'utilisateur qui réédite pendant que cette première requête (op1) est en vol.
          await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
          throw { response: { status: 422, data: { error: 'invalide' } } }
        }
        return { ...lvl(), name: body.name, revision: body.base_revision + 1, shelved: false }
      }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    // La seconde édition (V2) doit avoir été réellement envoyée — jamais sautée par le
    // dédoublonnage ni retirée de la file sans avoir été transmise au serveur.
    expect(api.updateLevel).toHaveBeenCalledTimes(2)
    expect(api.updateLevel.mock.calls[1][1].name).toBe('V2')
    expect(await local.pendingCount()).toBe(0)
    const stored = await local.getLevel(lvl().id)
    expect(stored.dirty).toBe(false)
    expect(stored.name).toBe('V2')
    // L'échec de la première tentative a bien été noté, puis effacé par le second envoi réussi.
    expect(stored.sync_error).toBeUndefined()
    expect(r.synced).toBe(1)
    expect(r.hasError).toBe(true)
  })

  it('refreshFromServer preserves sync_error across a successful background refresh', async () => {
    await local.putLevel(lvl({ revision: 1, dirty: false, sync_error: { code: 422, message: 'Géométrie invalide', at: 111 } }))
    const api = fakeApi({ sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 3, shelved_count: 0 }] }] })) })
    await refreshFromServer({ api, local })
    const stored = await local.getLevel(lvl().id)
    expect(stored.revision).toBe(3)
    expect(stored.sync_error).toMatchObject({ code: 422, message: 'Géométrie invalide' })
  })

  it('409 received while a newer edit is queued does not discard it nor count it as synced without sending it', async () => {
    const server = lvl({ revision: 5, name: 'Serveur' })
    let calls = 0
    const api = fakeApi({
      updateLevel: vi.fn(async (id, body) => {
        calls++
        if (calls === 1) {
          // Simule l'utilisateur qui réédite (édition B) pendant que op1 est en vol.
          await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
          throw { response: { status: 409, data: { level: server } } }
        }
        return { ...lvl(), name: body.name, revision: body.base_revision + 1, shelved: false }
      }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    // L'édition B doit vraiment partir sur le réseau, avec la révision de base du serveur.
    expect(api.updateLevel).toHaveBeenCalledTimes(2)
    expect(api.updateLevel.mock.calls[1][1].base_revision).toBe(5)
    expect(api.updateLevel.mock.calls[1][1].name).toBe('V2')
    expect(await local.pendingCount()).toBe(0)
    const stored = await local.getLevel(lvl().id)
    expect(stored.name).toBe('V2')
    expect(stored.dirty).toBe(false)
    expect(r.conflict).toBe(true)
  })

  it('a refresh right after a 409 superseded by a newer edit does not overwrite that edit', async () => {
    const server = lvl({ revision: 5, name: 'Serveur' })
    let calls = 0
    const api = fakeApi({
      updateLevel: vi.fn(async () => {
        calls++
        if (calls === 1) {
          await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
          throw { response: { status: 409, data: { level: server } } }
        }
        // La seconde tentative (l'édition B) échoue à son tour, en réseau cette fois : elle reste en file.
        throw Object.assign(new Error('net'), { code: 'ERR_NETWORK' })
      }),
      sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 9, shelved_count: 0 }] }] })),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect(await local.pendingCount()).toBe(1)
    await refreshFromServer({ api, local })
    const stored = await local.getLevel(lvl().id)
    expect(stored.dirty).toBe(true)
    expect(stored.name).toBe('V2')
  })

  it('5xx received while a newer edit is queued does not mark it as already sent — it still reaches the server', async () => {
    let calls = 0
    let dirtyBeforeSecondSend
    const api = fakeApi({
      updateLevel: vi.fn(async (id, body) => {
        calls++
        if (calls === 1) {
          await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
          throw { response: { status: 500, data: { error: 'boom' } } }
        }
        // Observe l'état laissé par markSyncError : l'édition en attente doit être restée
        // `dirty` (sans quoi un refreshFromServer concurrent l'écraserait).
        dirtyBeforeSecondSend = (await local.getLevel(id)).dirty
        return { ...lvl(), name: body.name, revision: body.base_revision + 1, shelved: false }
      }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    expect(api.updateLevel).toHaveBeenCalledTimes(2)
    expect(api.updateLevel.mock.calls[1][1].name).toBe('V2')
    expect(dirtyBeforeSecondSend).toBe(true)
    expect(await local.pendingCount()).toBe(0)
    const stored = await local.getLevel(lvl().id)
    expect(stored.name).toBe('V2')
    expect(stored.dirty).toBe(false)
    expect(r.hasError).toBe(true)
  })

  it('a refresh right after a 5xx superseded by a newer edit does not overwrite that edit', async () => {
    let calls = 0
    const api = fakeApi({
      updateLevel: vi.fn(async () => {
        calls++
        if (calls === 1) {
          await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
          throw { response: { status: 500, data: { error: 'boom' } } }
        }
        throw Object.assign(new Error('net'), { code: 'ERR_NETWORK' })
      }),
      sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 9, shelved_count: 0 }] }] })),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect(await local.pendingCount()).toBe(1)
    await refreshFromServer({ api, local })
    const stored = await local.getLevel(lvl().id)
    expect(stored.dirty).toBe(true)
    expect(stored.name).toBe('V2')
  })

  it('an edit applied while a SUCCESSFUL request is in flight survives and is sent afterwards', async () => {
    let calls = 0
    const api = fakeApi({
      updateLevel: vi.fn(async (id, body) => {
        calls++
        if (calls === 1) {
          // L'utilisateur réédite pendant que la requête de V1 est en vol — et celle-ci réussit.
          await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
        }
        return { ...lvl(), name: body.name, revision: body.base_revision + 1, shelved: false }
      }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    // Le succès de V1 ne doit ni restaurer le contenu d'avant V2 ni effacer son compteur :
    // V2 repart donc réellement, avec la révision de base rapportée par le serveur.
    expect(api.updateLevel).toHaveBeenCalledTimes(2)
    expect(api.updateLevel.mock.calls[1][1].name).toBe('V2')
    expect(api.updateLevel.mock.calls[1][1].base_revision).toBe(1)
    expect(await local.pendingCount()).toBe(0)
    const stored = await local.getLevel(lvl().id)
    expect(stored.name).toBe('V2')
    expect(stored.revision).toBe(2)
    expect(stored.dirty).toBe(false)
    expect(r.synced).toBe(2)
    expect(r.hasError).toBeFalsy()
  })

  it('a plain successful update (no concurrent edit) still marks the level synced and dedups a truly redundant op', async () => {
    const api = fakeApi()
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await runOnce({ api, local, onState: () => {} })
    let stored = await local.getLevel(lvl().id)
    expect(stored.dirty).toBe(false)
    expect(stored.revision).toBe(1)
    expect(stored.base_revision).toBe(1)
    // Une opération redondante (même contenu déjà transmis) doit rester dédoublonnée.
    await local.enqueue({ type: 'level.update', payload: { id: lvl().id }, client_seq: stored.synced_seq })
    const r = await runOnce({ api, local, onState: () => {} })
    expect(api.updateLevel).toHaveBeenCalledTimes(1)
    expect(r.synced).toBe(1)
    expect(await local.pendingCount()).toBe(0)
    stored = await local.getLevel(lvl().id)
    expect(stored).toMatchObject({ dirty: false, revision: 1, base_revision: 1 })
  })

  it('a project edit applied while its creation request is in flight is not reverted by the server echo', async () => {
    const pid = 'p'.repeat(32)
    const api = fakeApi({
      createProject: vi.fn(async (p) => {
        // L'utilisateur renomme le projet pendant que la création est en vol.
        await applyLocal({ type: 'project.update', payload: { id: pid, title: 'B' } }, { local })
        return { ...p, owner_id: 42, created_at: '2026-01-01T00:00:00Z', levels: [lvl()] }
      }),
    })
    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    await runOnce({ api, local, onState: () => {} })
    const stored = await local.getProject(pid)
    expect(stored.title).toBe('B')
    expect(stored.synced).toBe(true)
    expect(stored.owner_id).toBe(42)
    // Le renommage a bien été transmis au serveur, pas seulement conservé en local.
    expect(api.updateProject).toHaveBeenCalledWith(pid, expect.objectContaining({ title: 'B' }))
    expect(await local.pendingCount()).toBe(0)
  })

  it("hors ligne, le moteur annonce l'état offline et le nombre d'éditions en attente", async () => {
    const api = fakeApi()
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
      const states = []
      const engine = startEngine({ api, local, onState: (s) => states.push(s), intervalMs: 1000000 })
      await engine.tick()
      engine.stop()
      expect(api.sync).not.toHaveBeenCalled()
      expect(states.at(-1)).toEqual({ state: 'offline', pending: 1 })
    } finally {
      onLine.mockRestore()
    }
  })

  it('a new local edit clears a previous sync_error trace', async () => {
    await local.putLevel(lvl({ dirty: false, sync_error: { code: 422, message: 'Ancien échec', at: 1 } }))
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V2', geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const stored = await local.getLevel(lvl().id)
    expect(stored.sync_error).toBeUndefined()
    expect(stored.dirty).toBe(true)
    expect(stored.name).toBe('V2')
  })
})
