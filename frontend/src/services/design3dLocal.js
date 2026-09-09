import { deleteDB, openDB } from 'idb'

const DB = 'semsar-design3d'
const VERSION = 1

let dbp
let dbName

/**
 * Identité de la session, telle que le store d'authentification la pose au
 * login (`localStorage.userId`). Une base PAR COMPTE : sur la tablette
 * partagée — le cas d'usage explicite de la spec — l'agent suivant ne peut ni
 * lire les projets du précédent, ni voir sa file d'attente repartir sous son
 * propre jeton (403/404 destructeurs, ou révisions signées du mauvais auteur).
 * Sans compte identifié (session fermée), on retombe sur la base historique,
 * qui n'a alors rien à montrer.
 */
const currentUserId = () => {
  try {
    return localStorage.getItem('userId') || null
  } catch {
    return null
  }
}

const dbNameFor = (userId) => (userId ? `${DB}-u${userId}` : DB)

const open = (name) =>
  openDB(name, VERSION, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' })
      db.createObjectStore('levels', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      db.createObjectStore('backgrounds', { keyPath: 'level_id' })
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
    },
  })

// Oublie la connexion mémorisée (sans la fermer : l'appelant s'en charge quand
// il détient la poignée).
function forgetDb() {
  const prev = dbp
  dbp = undefined
  dbName = undefined
  return prev
}

export function openDb() {
  const name = dbNameFor(currentUserId())
  if (!dbp || dbName !== name) {
    // Changement de compte : la connexion précédente est fermée, sinon la base
    // du compte partant resterait ouverte (et bloquerait sa suppression).
    forgetDb()?.then((db) => db.close()).catch(() => {})
    dbName = name
    dbp = open(name)
  }
  return dbp
}

/**
 * Purge appelée à la déconnexion, sur les mêmes chemins que
 * `purgeRuntimeCaches()`.
 *
 * Règle : ne jamais détruire un travail que le serveur n'a pas reçu. Si la file
 * d'attente est vide, la base du compte partant est supprimée ; s'il reste des
 * éditions en attente, elle est conservée — elle porte le nom de ce compte, et
 * reste donc invisible pour l'agent suivant, tout en attendant le retour du
 * sien. Ne lève jamais : la déconnexion ne doit dépendre d'aucun stockage.
 */
export async function purgeLocalData(userId = currentUserId()) {
  const name = dbNameFor(userId)
  try {
    const isCurrent = dbName === name && !!dbp
    const db = await (isCurrent ? dbp : open(name))
    const pending = await db.count('outbox')
    if (isCurrent) forgetDb()
    db.close()
    if (pending > 0) return 'kept'
    await deleteDB(name)
    return 'deleted'
  } catch {
    return 'unavailable'
  }
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

export const listAllProjects = async () => (await openDb()).getAll('projects')

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

/**
 * Compte les tentatives d'une opération, sur l'enregistrement lui-même — un
 * compteur en mémoire repartirait de zéro à chaque rechargement de page, et une
 * opération qui échoue toujours de la même façon gèlerait la file pour
 * toujours. Renvoie le nombre de tentatives après incrément (0 si l'opération
 * a déjà été retirée).
 */
export const markAttempt = async (seq) => {
  const tx = (await openDb()).transaction('outbox', 'readwrite')
  const op = await tx.store.get(seq)
  if (!op) {
    await tx.done
    return 0
  }
  const attempts = (op.attempts ?? 0) + 1
  await tx.store.put({ ...op, attempts })
  await tx.done
  return attempts
}
export const pendingCount = async () => (await openDb()).count('outbox')

export const clearAll = async () => {
  const db = await openDb()
  await Promise.all(['projects', 'levels', 'backgrounds', 'outbox'].map((s) => db.clear(s)))
}
