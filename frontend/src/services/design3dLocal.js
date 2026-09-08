import { openDB } from 'idb'

const DB = 'semsar-design3d'
const VERSION = 1

let dbp

export function openDb() {
  dbp ??= openDB(DB, VERSION, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' })
      db.createObjectStore('levels', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      db.createObjectStore('backgrounds', { keyPath: 'level_id' })
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
    },
  })
  return dbp
}

export const getProject = async (id) => (await openDb()).get('projects', id)
export const putProject = async (p) => (await openDb()).put('projects', p)

export const deleteProjectLocal = async (id) => {
  const db = await openDb()
  const tx = db.transaction(['projects', 'levels', 'backgrounds'], 'readwrite')
  await tx.objectStore('projects').delete(id)
  for (const lv of await tx.objectStore('levels').index('project_id').getAll(id)) {
    await tx.objectStore('levels').delete(lv.id)
    await tx.objectStore('backgrounds').delete(lv.id)
  }
  await tx.done
}

export const listProjects = async (targetType, targetId) =>
  (await (await openDb()).getAll('projects')).filter((p) => p.target_type === targetType && p.target_id === targetId)

export const getLevel = async (id) => (await openDb()).get('levels', id)
export const putLevel = async (lv) => (await openDb()).put('levels', lv)
export const listLevels = async (projectId) => (await openDb()).getAllFromIndex('levels', 'project_id', projectId)

export const putBackground = async (level_id, blob, type) => (await openDb()).put('backgrounds', { level_id, blob, type })
export const getBackground = async (level_id) => (await openDb()).get('backgrounds', level_id)

export const enqueue = async (op) => (await openDb()).add('outbox', { ...op, created_at: op.created_at ?? Date.now() })
export const peek = async () => {
  const all = await (await openDb()).getAll('outbox')
  return all[0] ?? null
}
export const remove = async (seq) => (await openDb()).delete('outbox', seq)
export const pendingCount = async () => (await openDb()).count('outbox')

export const clearAll = async () => {
  const db = await openDb()
  await Promise.all(['projects', 'levels', 'backgrounds', 'outbox'].map((s) => db.clear(s)))
}
