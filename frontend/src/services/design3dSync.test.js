import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as local from './design3dLocal'
import { applyLocal, runOnce, refreshFromServer } from './design3dSync'

const lvl = (over = {}) => ({ id: 'l'.repeat(32), project_id: 'p'.repeat(32), name: 'RDC', position: 0, revision: 0,
  wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false, ...over })

function fakeApi(overrides = {}) {
  return {
    createProject: vi.fn(async (p) => ({ ...p, levels: [lvl()] })),
    updateLevel: vi.fn(async (id, body) => ({ ...lvl(), revision: body.base_revision + 1, shelved: false })),
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
})
