import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as local from './design3dLocal'
import { isLevelEmpty } from './design3dLocal'
import { newId } from '../utils/floorplan'
import { applyLocal, cleanupEmpty, discardRefusedProject, runOnce, refreshFromServer, startEngine } from './design3dSync'

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

  it('a target refusal (403) on project.create does not turn the queued level.update into a misleading 404 — the drawing stays local with a truthful error', async () => {
    const pid = 'p'.repeat(32)
    const message = 'Cible hors du périmètre de votre agence'
    const api = fakeApi({
      createProject: vi.fn(async () => { throw { response: { status: 403, data: { error: message, error_code: 'target_denied' } } } }),
    })
    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    const [seeded] = await local.listLevels(pid)
    const geometry = { walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness_m: 0.2 }], rooms: [], openings: [] }
    await applyLocal({ type: 'level.update', payload: { id: seeded.id, geometry } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    // Le refus de la cible ne doit jamais faire partir un appel réseau vers un
    // projet qui n'a jamais existé côté serveur : sans ce court-circuit,
    // `updateLevel` serait appelé et échouerait par un 404 sans rapport avec
    // la vraie cause — reproduisant exactement le défaut C1 sur ce cas précis.
    expect(api.updateLevel).not.toHaveBeenCalled()
    expect(await local.pendingCount()).toBe(0)
    const project = await local.getProject(pid)
    expect(project.sync_error).toMatchObject({ code: 403, message, target_refusal: true })
    const level = await local.getLevel(seeded.id)
    // Le dessin n'est pas perdu : il reste en local, avec une erreur qui
    // reflète la vraie cause (403, refus de cible) plutôt qu'un 404 trompeur.
    expect(level.geometry).toEqual(geometry)
    expect(level.sync_error).toMatchObject({ code: 403, message })
    expect(r.hasError).toBe(true)
  })

  it("un 403 d'entitlement (plan expiré) à la création n'est jamais pris pour un refus de cible", async () => {
    // Sur `POST /design3d/projects`, `require_feature("design3d")` (Depends) et
    // `_target_denied` (dans le corps de la route) peuvent tous deux répondre
    // 403 — mais pour des raisons opposées : l'un est rejouable (l'agence
    // réactive son abonnement), l'autre définitif. Seul `_target_denied` pose
    // `error_code: "target_denied"` ; son absence ici (agence sans entitlement)
    // ne doit jamais faire croire à un refus définitif, sous peine de proposer
    // l'abandon — donc la destruction — d'un projet parfaitement récupérable.
    const pid = 'p'.repeat(32)
    const message = 'Fonction réservée aux plans Pro et Entreprise.'
    const api = fakeApi({
      createProject: vi.fn(async () => { throw { response: { status: 403, data: { error: message } } } }),
    })
    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    await runOnce({ api, local, onState: () => {} })

    const project = await local.getProject(pid)
    expect(project.sync_error).toMatchObject({ code: 403, message })
    expect(project.sync_error.target_refusal).toBeUndefined()
    // Aucune sortie par abandon ne doit être ouverte : le projet garde toutes
    // ses chances d'être rejoué avec succès une fois l'entitlement rétabli.
    expect(await discardRefusedProject(pid, { local })).toBe(false)
    expect(await local.getProject(pid)).toBeTruthy()
  })

  it("une cible introuvable (404) à la création est un refus définitif, comme le 403 hors périmètre", async () => {
    // `_target_denied` (main.py) refuse une création avec DEUX codes : 403 hors
    // périmètre et 404 cible introuvable — une cible supprimée entre le
    // chargement du formulaire et la soumission. Les deux sont définitifs.
    const pid = 'p'.repeat(32)
    const message = 'Cible introuvable'
    const api = fakeApi({
      createProject: vi.fn(async () => { throw { response: { status: 404, data: { error: message, error_code: 'target_denied' } } } }),
    })
    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    const [seeded] = await local.listLevels(pid)
    const geometry = { walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness_m: 0.2 }], rooms: [], openings: [] }
    await applyLocal({ type: 'level.update', payload: { id: seeded.id, geometry } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })

    // Sans court-circuit, le `level.update` partait vers un niveau que le
    // serveur ne connaît pas et récoltait un 404 de `_load_level` masquant la
    // vraie cause — le défaut C1, par la porte du 404.
    expect(api.updateLevel).not.toHaveBeenCalled()
    expect((await local.getProject(pid)).sync_error).toMatchObject({ code: 404, message })
    expect((await local.getLevel(seeded.id)).sync_error).toMatchObject({ code: 404, message })
    expect((await local.getLevel(seeded.id)).geometry).toEqual(geometry)
    expect(r.hasError).toBe(true)
    // Et la sortie du cul-de-sac doit être ouverte, comme pour un 403.
    expect(await discardRefusedProject(pid, { local })).toBe(true)
  })

  it("un 404 ordinaire n'est jamais pris pour un refus de cible", async () => {
    // Piège à éviter : tous les 404 ne se valent pas. Celui-ci vient d'une
    // ressource disparue sur une mise à jour, pas du refus d'une cible à la
    // création — le confondre transformerait un échec récupérable en abandon
    // définitif, et couperait le projet de toute nouvelle tentative.
    const pid = 'p'.repeat(32)
    const api = fakeApi({
      updateProject: vi.fn(async () => { throw { response: { status: 404, data: { error: 'Not found' } } } }),
    })
    await local.putProject({ id: pid, title: 'A' })
    await applyLocal({ type: 'project.update', payload: { id: pid, title: 'B' } }, { local })
    await runOnce({ api, local, onState: () => {} })

    const proj = await local.getProject(pid)
    expect(proj.sync_error).toMatchObject({ code: 404 })
    expect(proj.synced).toBeUndefined()
    // Ni abandon proposé, ni court-circuit : ce projet garde toutes ses chances.
    expect(await discardRefusedProject(pid, { local })).toBe(false)
    expect(await local.getProject(pid)).toBeTruthy()
    api.updateProject.mockClear()
    await applyLocal({ type: 'project.update', payload: { id: pid, title: 'C' } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect(api.updateProject).toHaveBeenCalled()
  })

  it('un projet définitivement refusé peut être abandonné : projet, niveaux et file partent ensemble', async () => {
    const pid = 'p'.repeat(32)
    const api = fakeApi({
      createProject: vi.fn(async () => { throw { response: { status: 403, data: { error: 'Cible hors périmètre', error_code: 'target_denied' } } } }),
    })
    await applyLocal({ type: 'project.create', payload: { id: pid, target_type: 'property', target_id: 1, title: 'A' } }, { local })
    const [seeded] = await local.listLevels(pid)
    await applyLocal({ type: 'level.update', payload: { id: seeded.id, name: 'RDC' } }, { local })
    await runOnce({ api, local, onState: () => {} })

    // Sans cette sortie, le projet reste piégé pour toujours : aucun chemin ne
    // réenfile un `project.create`, et `targetRefusalError` court-circuite
    // définitivement toute opération de tous ses niveaux.
    expect(await discardRefusedProject(pid, { local })).toBe(true)
    expect(await local.getProject(pid)).toBeUndefined()
    expect(await local.listLevels(pid)).toEqual([])
    // Aucune opération orpheline ne doit rester en file, sinon elle repartirait
    // vers un projet inexistant et récolterait des 404 sans objet.
    expect(await local.pendingCount()).toBe(0)
  })

  it("n'abandonne jamais un projet qui n'est pas définitivement refusé", async () => {
    const pid = 'p'.repeat(32)
    await local.putProject({ id: pid, title: 'A', synced: true, sync_error: { code: 403, message: 'Interdit' } })
    expect(await discardRefusedProject(pid, { local })).toBe(false)
    expect(await local.getProject(pid)).toBeTruthy()

    await local.putProject({ id: pid, title: 'A', synced: false, sync_error: { code: 422, message: 'Invalide' } })
    expect(await discardRefusedProject(pid, { local })).toBe(false)
    expect(await local.getProject(pid)).toBeTruthy()
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

  it('409 laisse une trace persistante disant que la version a été mise de côté', async () => {
    // Le badge « conflit » est fugace : sans trace sur le niveau, l'auteur de
    // la version écrasée n'apprend jamais ce qui lui est arrivé (I5).
    const server = lvl({ revision: 5, name: 'Serveur' })
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 409, data: { level: server } } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    await runOnce({ api, local, onState: () => {} })
    const stored = await local.getLevel(lvl().id)
    expect(stored.shelved_notice).toMatchObject({ revision: 5, at: expect.any(Number) })
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

  it('deux éditions concurrentes du même niveau sont toutes deux comptées (lire-puis-écrire atomique)', async () => {
    // Le compteur `edit_seq` — sur lequel reposent tout le dédoublonnage et la
    // détection d'édition concurrente (quatre rounds de correctifs) — suppose
    // que lire puis écrire un niveau est atomique. Avec deux transactions
    // séparées, les deux flux lisent 0, écrivent 1, et une édition disparaît.
    await local.putLevel(lvl({ name: 'V0' }))
    // Double dont la LECTURE traîne : reproduit l'entrelacement réel entre la
    // sauvegarde différée de l'éditeur et le tick du moteur.
    const slow = { ...local, getLevel: async (id) => { const v = await local.getLevel(id); await new Promise((r) => { setTimeout(r, 5) }); return v } }
    await Promise.all([
      applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'A' } }, { local: slow }),
      applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'B' } }, { local: slow }),
    ])
    expect((await local.getLevel(lvl().id)).edit_seq).toBe(2)
    expect(await local.pendingCount()).toBe(2)
  })

  it("refreshFromServer n'écrase pas une édition survenue pendant l'appel réseau", async () => {
    await local.putLevel(lvl({ revision: 1, dirty: false, name: 'Serveur' }))
    const api = fakeApi({
      sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 3, shelved_count: 0 }] }] })),
      getProject: vi.fn(async () => {
        // L'agent dessine pendant que la requête est en vol : le niveau était
        // propre à la lecture d'avant l'attente, il ne l'est plus à l'écriture.
        await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'Local' } }, { local })
        return { id: 'p'.repeat(32), levels: [lvl({ revision: 3, name: 'Serveur' })] }
      }),
    })
    await refreshFromServer({ api, local })
    const stored = await local.getLevel(lvl().id)
    expect(stored.name).toBe('Local')
    expect(stored.dirty).toBe(true)
  })

  it("refreshFromServer ne fait pas régresser un niveau dont l'envoi a abouti pendant l'appel réseau (C3)", async () => {
    await local.putLevel(lvl({ revision: 1, dirty: false, name: 'Ancien' }))
    const api = fakeApi({
      sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 2, shelved_count: 0 }] }] })),
      getProject: vi.fn(async () => {
        // Un envoi (send()) a abouti pour ce niveau pendant que CET appel
        // réseau était en vol : sa révision locale est désormais PLUS AVANCÉE
        // que celle que `fresh` (lue avant l'attente) s'apprête à écrire.
        await local.mutateLevel(lvl().id, (cur) => ({ ...cur, revision: 5, base_revision: 5, dirty: false, name: 'Nouveau', synced_seq: 9 }))
        return { id: 'p'.repeat(32), levels: [lvl({ revision: 2, name: 'Ancien' })] }
      }),
    })
    await refreshFromServer({ api, local })
    const stored = await local.getLevel(lvl().id)
    // Sans reprendre le test de fraîcheur DANS la transaction d'écriture (et
    // pas seulement celui de saleté), le niveau régresserait silencieusement
    // vers la révision 2 malgré son avance à la 5.
    expect(stored.revision).toBe(5)
    expect(stored.name).toBe('Nouveau')
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

  it('un 422 conserve le détail des problèmes renvoyé par le serveur', async () => {
    // `{"error": "Géométrie invalide", "details": [...]}` (main.py) : sans les
    // `details`, le message ne dit pas CE QUI est invalide, donc n'est pas
    // exploitable par l'agent.
    const details = ['ouverture o1 : dépasse la hauteur du mur', 'mur w2 : deux points distincts requis']
    const api = fakeApi({
      updateLevel: vi.fn(async () => { throw { response: { status: 422, data: { error: 'Géométrie invalide', details } } } }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] } } }, { local })
    await runOnce({ api, local, onState: () => {} })
    const stored = await local.getLevel(lvl().id)
    expect(stored.sync_error).toMatchObject({ code: 422, message: 'Géométrie invalide', details })
  })

  it("une mise en quarantaine marque l'échec comme interne, sans en faire un message pour l'agent", async () => {
    const api = fakeApi({
      updateLevel: vi.fn(async () => { throw new TypeError("Cannot read properties of undefined (reading 'blob')") }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] } } }, { local })
    for (let i = 0; i < 3; i++) await runOnce({ api, local, onState: () => {} })
    const stored = await local.getLevel(lvl().id)
    // Le texte brut reste consigné pour le diagnostic, mais il est marqué comme
    // interne : l'interface ne doit pas le servir tel quel à un agent.
    expect(stored.sync_error.kind).toBe('client')
    expect(stored.sync_error.message).toContain('blob')
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

  it("une exception sans réponse HTTP ne gèle pas la file et n'annonce pas « hors ligne »", async () => {
    const otherId = 'o'.repeat(32)
    const api = fakeApi({
      updateLevel: vi.fn(async (id) => {
        // Forme exacte du défaut : une exception du CLIENT, sans réponse HTTP,
        // alors que le réseau va très bien (cf. `bg.blob` sur un fond absent).
        if (id === lvl().id) throw new TypeError("Cannot read properties of undefined (reading 'blob')")
        return { ...lvl({ id }), revision: 1, shelved: false }
      }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] } } }, { local })
    await applyLocal({ type: 'level.update', payload: { id: otherId, geometry: { walls: [], rooms: [], openings: [] } } }, { local })

    const states = []
    let r
    // Quelques tours du moteur : l'opération doit finir en quarantaine, pas
    // rejouer à l'identique pour toujours en bloquant tout le reste.
    for (let i = 0; i < 3; i++) r = await runOnce({ api, local, onState: (s) => states.push(s) })

    expect(states.some((s) => s.state === 'offline')).toBe(false)
    expect(await local.pendingCount()).toBe(0)
    expect(r.hasError).toBe(true)
    const stuck = await local.getLevel(lvl().id)
    expect(stuck.sync_error).toMatchObject({ message: expect.stringContaining('blob') })
    // Le reste de la file, pour tous les autres niveaux, a bien pu repartir.
    expect((await local.getLevel(otherId)).revision).toBe(1)
  })

  it('une exception du client transitoire est rejouée avant toute quarantaine', async () => {
    let calls = 0
    const api = fakeApi({
      updateLevel: vi.fn(async (id, body) => {
        calls++
        if (calls === 1) throw new TypeError('stockage momentanément indisponible')
        return { ...lvl(), name: body.name, revision: body.base_revision + 1, shelved: false }
      }),
    })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, name: 'V1', geometry: { walls: [], rooms: [], openings: [] } } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect(await local.pendingCount()).toBe(1)
    await runOnce({ api, local, onState: () => {} })
    expect(await local.pendingCount()).toBe(0)
    const stored = await local.getLevel(lvl().id)
    expect(stored.name).toBe('V1')
    expect(stored.dirty).toBe(false)
    expect(stored.sync_error).toBeUndefined()
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

  it("une nouvelle édition de projet efface une trace d'échec dépassée — sauf si la création a été refusée", async () => {
    const pid = 'p'.repeat(32)
    // Projet connu du serveur : l'échec porte sur une mise à jour, une nouvelle
    // édition le rend caduc.
    await local.putProject({ id: pid, title: 'A', synced: true, sync_error: { code: 422, message: 'Statut invalide', at: 1 } })
    await applyLocal({ type: 'project.update', payload: { id: pid, status: 'ready' } }, { local })
    expect((await local.getProject(pid)).sync_error).toBeUndefined()

    // Création refusée : la trace DOIT survivre, `targetRefusalError` en dépend
    // pour ne pas laisser partir des opérations vers un projet inexistant (C1).
    await local.putProject({ id: pid, title: 'A', synced: false, sync_error: { code: 403, message: 'Cible refusée', at: 1 } })
    await applyLocal({ type: 'project.update', payload: { id: pid, title: 'B' } }, { local })
    expect((await local.getProject(pid)).sync_error).toMatchObject({ code: 403 })
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

describe('isLevelEmpty / cleanupEmpty — niveaux et projets laissés vides', () => {
  const emptyGeo = { walls: [], rooms: [], openings: [] }

  // Écrit un projet et ses niveaux directement en local (hors file d'attente,
  // hors réseau) : ces tests portent sur le nettoyage lui-même, pas sur la
  // synchronisation.
  async function seedProject({ status = 'draft', synced = true, levels = [{}] } = {}) {
    const projectId = newId()
    await local.putProject({ id: projectId, title: 'A', status, synced, target_type: 'property', target_id: 1 })
    for (const over of levels) {
      const { walls = [], rooms = [], openings = [], ...rest } = over
      await local.putLevel(lvl({ id: newId(), project_id: projectId, geometry: { walls, rooms, openings }, ...rest }))
    }
    return projectId
  }

  // Instantané des révisions serveur du chemin EN LIGNE : le `sync` vient
  // d'aboutir et ne signale rien de plus récent que la copie locale. Il est
  // indispensable pour qu'un projet déjà synchronisé soit candidat au
  // nettoyage : sans instantané, la copie locale ne dit rien de ce que le
  // serveur détient, et le nettoyage reste purement local.
  const upToDate = () => new Map()

  it('ne considère pas vide un niveau qui porte une image ou une calibration', () => {
    expect(isLevelEmpty({ geometry: emptyGeo })).toBe(true)
    expect(isLevelEmpty({ geometry: emptyGeo, background_image_key: 'k' })).toBe(false)
    expect(isLevelEmpty({ geometry: emptyGeo, calibration: { scale: 1 } })).toBe(false)
    expect(isLevelEmpty({ geometry: { ...emptyGeo, walls: [{ id: 'w' }] } })).toBe(false)
  })

  it('supprime le projet quand tous ses niveaux sont vides', async () => {
    const api = fakeApi()
    const projectId = await seedProject({ levels: [{}, {}] })
    expect(await cleanupEmpty(projectId, { api, local, serverRevisions: upToDate() })).toEqual({ removedLevels: 2, removedProject: true })
    expect(await local.getProject(projectId)).toBeUndefined()
  })

  it('ne touche jamais un projet publié', async () => {
    const api = fakeApi()
    const projectId = await seedProject({ status: 'ready', levels: [{}] })
    expect(await cleanupEmpty(projectId, { api, local })).toEqual({ removedLevels: 0, removedProject: false })
    expect(await local.getProject(projectId)).toBeDefined()
  })

  it("ne supprime que les niveaux vides quand d'autres portent du travail", async () => {
    const api = fakeApi()
    const projectId = await seedProject({ levels: [{}, { walls: [{ id: 'w' }] }] })
    expect(await cleanupEmpty(projectId, { api, local, serverRevisions: upToDate() })).toEqual({ removedLevels: 1, removedProject: false })
  })

  it('purge localement un projet jamais synchronisé, sans envoyer de suppression', async () => {
    const api = fakeApi({ deleteProject: vi.fn() })
    const projectId = await seedProject({ synced: false, levels: [{}] })
    await cleanupEmpty(projectId, { api, local })
    expect(api.deleteProject).not.toHaveBeenCalled()
    expect(await local.pendingCount()).toBe(0)
  })

  // --- C2 : ne jamais supprimer sur la foi d'une copie locale périmée -------
  it("ne supprime pas un projet dont le serveur détient une version plus récente que la copie locale", async () => {
    const api = fakeApi({ deleteProject: vi.fn() })
    const projectId = await seedProject({ synced: true, levels: [{}] })
    const [level] = await local.listLevels(projectId)
    // La tablette a tiré ce niveau quand il était vide (revision 0) ; un
    // collègue l'a tracé depuis un autre appareil (revision 4).
    const serverRevisions = new Map([[level.id, 4]])

    expect(await cleanupEmpty(projectId, { api, local, serverRevisions })).toEqual({ removedLevels: 0, removedProject: false })
    expect(await local.getProject(projectId)).toBeDefined()
    await runOnce({ api, local, onState: () => {} })
    expect(api.deleteProject).not.toHaveBeenCalled()
  })

  it("ne supprime pas un niveau vide dont l'édition locale n'a pas encore été transmise", async () => {
    const api = fakeApi({ deleteProject: vi.fn() })
    const projectId = await seedProject({ synced: true, levels: [{ dirty: true }] })
    expect(await cleanupEmpty(projectId, { api, local, serverRevisions: upToDate() })).toEqual({ removedLevels: 0, removedProject: false })
    expect(await local.getProject(projectId)).toBeDefined()
  })

  // --- L1 : sans instantané serveur, le nettoyage reste purement local ------
  // Scénario de DESTRUCTION, pas seulement la condition : l'agent ouvre HORS
  // LIGNE un projet de l'agence pour regarder le plan, ne trace rien, et
  // ressort. Le démontage de l'éditeur appelle `cleanupEmpty` sans instantané
  // (DesignEditor.jsx n'en a pas : il n'y a pas de réseau pour l'obtenir), et
  // depuis que la liste des projets REPORTE son balayage hors ligne, c'est le
  // seul chemin de nettoyage qui s'exécute sans réseau. La copie locale est
  // vide et non modifiée — mais elle ne dit rien de ce que le serveur détient :
  // un collègue a pu tracer le plan depuis un autre appareil. Sans garde,
  // `project.delete` part en file et, au retour du réseau, le plan disparaît
  // pour TOUTE L'AGENCE.
  it("ne fait partir aucune suppression au serveur quand le nettoyage n'a pas d'instantané", async () => {
    const api = fakeApi({ deleteProject: vi.fn(), deleteLevel: vi.fn() })
    const projectId = await seedProject({ synced: true, levels: [{}] })

    expect(await cleanupEmpty(projectId, { api, local })).toEqual({ removedLevels: 0, removedProject: false })
    expect(await local.getProject(projectId)).toBeDefined()
    await runOnce({ api, local, onState: () => {} })
    expect(api.deleteProject).not.toHaveBeenCalled()
    expect(api.deleteLevel).not.toHaveBeenCalled()
  })

  // --- C1 (lot C) : un instantané servi depuis un cache ne prouve rien ------
  // Le service worker sert les lectures design3d en `NetworkFirst` avec une
  // rétention d'une semaine : hors ligne, `api.sync()` RÉUSSISSAIT en rendant
  // un instantané vieux de plusieurs jours. Non nul mais périmé, il ne
  // signalait aucun niveau plus récent que la copie locale — donc le projet
  // était jugé vide et `project.delete` partait détruire le plan qu'un collègue
  // avait tracé entre-temps depuis un autre appareil.
  it("hors ligne, un instantané périmé ne fait partir aucune suppression alors qu'un collègue a avancé le plan", async () => {
    const projectId = await seedProject({ synced: true, levels: [{}] })
    const [level] = await local.listLevels(projectId)
    const api = fakeApi({
      // Ce que rend le CACHE : l'état de la semaine dernière, où le niveau
      // était encore vide à la révision de la copie locale.
      sync: vi.fn(async () => ({ projects: [{ id: projectId, levels: [{ id: level.id, revision: level.revision ?? 0, shelved_count: 0 }] }] })),
      deleteProject: vi.fn(),
      deleteLevel: vi.fn(),
    })
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const serverRevisions = await refreshFromServer({ api, local })
      expect(await cleanupEmpty(projectId, { api, local, serverRevisions })).toEqual({ removedLevels: 0, removedProject: false })
      expect(await local.getProject(projectId)).toBeDefined()
    } finally {
      onLine.mockRestore()
    }
    await runOnce({ api, local, onState: () => {} })
    expect(api.deleteProject).not.toHaveBeenCalled()
    expect(api.deleteLevel).not.toHaveBeenCalled()
  })

  // --- C1 : la photo du plan papier compte comme du travail -----------------
  // Scénario de DESTRUCTION, pas seulement la condition : l'agent photographie
  // le plan papier, quitte avant de calibrer, et la liste des projets balaie.
  // Sans marqueur sur l'enregistrement du NIVEAU, `isLevelEmpty` le juge vide
  // et le projet part — jusque sur le serveur, pour toute l'agence.
  it('ne détruit pas un niveau qui porte une photo de plan importée mais pas encore calibrée', async () => {
    const api = fakeApi({ deleteProject: vi.fn() })
    const projectId = await seedProject({ synced: true, levels: [{}] })
    const [level] = await local.listLevels(projectId)

    await applyLocal(
      { type: 'level.background', payload: { id: level.id, blob: new Blob(['photo'], { type: 'image/jpeg' }), type: 'image/jpeg' } },
      { local },
    )

    expect(isLevelEmpty(await local.getLevel(level.id))).toBe(false)
    expect(await cleanupEmpty(projectId, { api, local, serverRevisions: upToDate() })).toEqual({ removedLevels: 0, removedProject: false })
    expect(await local.getProject(projectId)).toBeDefined()
    // La photo elle-même survit : `deleteProjectLocal` purge aussi le magasin
    // `backgrounds`, donc la juger vide la détruirait sur l'appareil.
    expect(await local.getBackground(level.id)).toBeDefined()

    // Et rien ne part vers le serveur : c'est là que la destruction devenait
    // irréversible pour toute l'agence et tous ses appareils.
    await runOnce({ api, local, onState: () => {} })
    expect(api.deleteProject).not.toHaveBeenCalled()
  })

  it("l'écho du serveur, qui ignore encore la photo, n'efface pas le marqueur local", async () => {
    // `upload_background` ne fait pas avancer `revision` côté serveur (dette
    // consignée) : son `background_image_key: null` ne doit jamais reprendre le
    // dessus sur une photo bel et bien présente sur cet appareil, sinon le
    // chemin destructif se rouvre au premier rafraîchissement.
    const projectId = await seedProject({ synced: true, levels: [{}] })
    const [level] = await local.listLevels(projectId)
    await applyLocal(
      { type: 'level.background', payload: { id: level.id, blob: new Blob(['photo'], { type: 'image/jpeg' }), type: 'image/jpeg' } },
      { local },
    )
    const server = lvl({ id: level.id, project_id: projectId, revision: 7, background_image_key: null })
    const api = fakeApi({
      sync: vi.fn(async () => ({ projects: [{ id: projectId, levels: [{ id: level.id, revision: 7, shelved_count: 0 }] }] })),
      getProject: vi.fn(async () => ({ id: projectId, levels: [server] })),
    })
    await refreshFromServer({ api, local })
    expect(isLevelEmpty(await local.getLevel(level.id))).toBe(false)
  })
})
