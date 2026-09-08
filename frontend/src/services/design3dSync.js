import * as defaultLocal from './design3dLocal'
import * as defaultApi from './design3dApi'
import { newId } from '../utils/floorplan'

const isNetworkError = (e) => !e?.response && (e?.code === 'ERR_NETWORK' || e?.message === 'net' || !navigator.onLine)

let failures = 0

// Point d'entrée unique pour toute mutation de l'éditeur : écrit d'abord en
// local (IndexedDB), l'UI ne dépend jamais du réseau, puis empile l'opération
// dans la file d'attente pour rejeu par le moteur de synchronisation.
export async function applyLocal(op, { local = defaultLocal } = {}) {
  const p = op.payload
  switch (op.type) {
    case 'project.create': {
      const id = p.id ?? newId()
      await local.putProject({ ...p, id, status: 'draft', synced: false })
      await local.putLevel({
        id: newId(),
        project_id: id,
        name: 'RDC',
        position: 0,
        revision: 0,
        base_revision: 0,
        wall_height_m: 2.7,
        calibration: null,
        geometry: { walls: [], rooms: [], openings: [] },
        dirty: false,
      })
      break
    }
    case 'project.update':
      await local.putProject({ ...(await local.getProject(p.id)), ...p })
      break
    case 'project.delete':
      await local.deleteProjectLocal(p.id)
      break
    case 'level.create':
      await local.putLevel({ revision: 0, base_revision: 0, dirty: false, ...p })
      break
    case 'level.update': {
      const cur = (await local.getLevel(p.id)) ?? { id: p.id, revision: 0 }
      await local.putLevel({ ...cur, ...p, base_revision: cur.dirty ? cur.base_revision : cur.revision, dirty: true })
      break
    }
    case 'level.delete':
      await local.putLevel({ ...(await local.getLevel(p.id)), deleted: true })
      break
    case 'level.background':
      await local.putBackground(p.id, p.blob, p.type)
      break
    default:
      throw new Error(`op inconnue: ${op.type}`)
  }
  await local.enqueue(op)
}

async function send(op, api, local) {
  const p = op.payload
  switch (op.type) {
    case 'project.create': {
      const r = await api.createProject(p)
      await local.putProject({ ...(await local.getProject(p.id)), ...r, synced: true })
      return
    }
    case 'project.update':
      await api.updateProject(p.id, p)
      return
    case 'project.delete':
      await api.deleteProject(p.id)
      return
    case 'level.create':
      await api.createLevel(p.project_id, p)
      return
    case 'level.update': {
      const cur = await local.getLevel(p.id)
      const r = await api.updateLevel(p.id, {
        base_revision: cur.base_revision ?? 0,
        name: cur.name,
        position: cur.position,
        wall_height_m: cur.wall_height_m,
        calibration: cur.calibration,
        geometry: cur.geometry,
        show_background_public: cur.show_background_public,
      })
      await local.putLevel({ ...cur, ...r, base_revision: r.revision, dirty: false })
      return r.shelved ? 'shelved' : undefined
    }
    case 'level.delete':
      await api.deleteLevel(p.id)
      return
    case 'level.background': {
      const bg = await local.getBackground(p.id)
      await api.uploadBackground(p.id, bg.blob, bg.type)
      return
    }
    default:
      throw new Error(`op inconnue: ${op.type}`)
  }
}

// Rejoue la file dans l'ordre, une opération à la fois. Une opération n'est
// retirée qu'après succès confirmé par le serveur.
export async function runOnce({ api = defaultApi, local = defaultLocal, onState } = {}) {
  let synced = 0
  let conflict = false
  onState?.({ state: 'syncing', pending: await local.pendingCount() })
  for (;;) {
    const op = await local.peek()
    if (!op) break
    try {
      const flag = await send(op, api, local)
      if (flag === 'shelved') conflict = true
      await local.remove(op.seq)
      synced++
      failures = 0
    } catch (e) {
      const status = e?.response?.status

      if (status === 401) {
        onState?.({ state: 'auth_expired', pending: await local.pendingCount() })
        return { synced, pending: await local.pendingCount(), conflict }
      }

      if (status === 409 && op.type === 'level.update') {
        const server = e.response.data?.level
        if (server) await local.putLevel({ ...server, base_revision: server.revision, dirty: false })
        await local.remove(op.seq)
        conflict = true
        continue
      }

      if (status === 422 || status === 403 || status === 404) {
        // Opération irrécupérable côté serveur : la garder bloquerait toute
        // la file indéfiniment, on la retire et on signale l'erreur.
        await local.remove(op.seq)
        onState?.({ state: 'error', error: e.response?.data, pending: await local.pendingCount() })
        continue
      }

      if (isNetworkError(e) || !status) {
        failures++
        const retryInMs = Math.min(2 ** failures * 1000, 300000)
        onState?.({ state: 'offline', pending: await local.pendingCount(), retryInMs })
        return { synced, pending: await local.pendingCount(), conflict, retryInMs }
      }

      // Autre erreur serveur inattendue : ne pas bloquer la file dessus.
      await local.remove(op.seq)
    }
  }
  const pending = await local.pendingCount()
  onState?.({ state: conflict ? 'conflict' : 'synced', pending, at: Date.now() })
  return { synced, pending, conflict }
}

// Recharge depuis le serveur les niveaux dont la révision a avancé, sans
// jamais écraser un niveau modifié localement et non encore synchronisé.
export async function refreshFromServer({ api = defaultApi, local = defaultLocal, onShelved } = {}) {
  const { projects } = await api.sync()
  for (const p of projects) {
    for (const lv of p.levels) {
      const cur = await local.getLevel(lv.id)
      if (lv.shelved_count > 0) onShelved?.(lv.id, lv.shelved_count)
      if (cur?.dirty) continue
      if (!cur || lv.revision > cur.revision) {
        const full = await api.getProject(p.id)
        const fresh = full.levels.find((l) => l.id === lv.id)
        if (fresh) await local.putLevel({ ...fresh, base_revision: fresh.revision, dirty: false })
        // eslint-disable-next-line no-unused-vars -- déstructuration volontaire pour omettre `levels`
        const { levels, ...projectFields } = full
        await local.putProject({ ...(await local.getProject(p.id)), ...projectFields, synced: true })
      }
    }
  }
}

export function startEngine({ api = defaultApi, local = defaultLocal, onState, intervalMs = 30000 } = {}) {
  let running = false
  const tick = async () => {
    if (running || !navigator.onLine) return
    running = true
    try {
      const r = await runOnce({ api, local, onState })
      if (!r.retryInMs) await refreshFromServer({ api, local })
    } catch {
      // Erreur réseau imprévue : on retentera au prochain déclenchement.
    } finally {
      running = false
    }
  }
  const onOnline = () => tick()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') tick()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  const timer = setInterval(tick, intervalMs)
  tick()
  return {
    tick,
    stop() {
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
