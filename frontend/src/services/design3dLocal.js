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
 * d'attente est vide, la base du compte partant est vidée ; s'il reste des
 * éditions en attente, elle est conservée — elle porte le nom de ce compte, et
 * reste donc invisible pour l'agent suivant, tout en attendant le retour du
 * sien. Ne lève jamais : la déconnexion ne doit dépendre d'aucun stockage.
 *
 * Compter l'outbox puis décider (garder / effacer) DANS LA MÊME transaction
 * `readwrite`, portant sur les quatre magasins : IndexedDB sérialise les
 * transactions qui se recouvrent, donc aucune écriture concurrente — une
 * édition de l'éditeur, un rejeu du moteur — ne peut plus s'intercaler entre
 * le comptage et la suppression (cf. C5). Une transaction bloquée en attente
 * de la nôtre s'exécute normalement une fois la nôtre validée : si elle ajoute
 * une opération après que nous avons vidé les magasins, cette opération
 * survit dans la base (désormais vide) au lieu d'être détruite avec elle.
 *
 * Vider les magasins plutôt qu'appeler `deleteDB` : cette dernière exige la
 * fermeture de TOUTES les connexions puis agit hors transaction — elle
 * rouvrirait exactement la fenêtre non atomique que cette fonction referme.
 */
export async function purgeLocalData(userId = currentUserId()) {
  const name = dbNameFor(userId)
  try {
    const isCurrent = dbName === name && !!dbp
    const db = await (isCurrent ? dbp : open(name))
    const stores = ['projects', 'levels', 'backgrounds', 'outbox']
    const tx = db.transaction(stores, 'readwrite')
    const pending = await tx.objectStore('outbox').count()
    if (pending === 0) {
      await Promise.all(stores.map((s) => tx.objectStore(s).clear()))
    }
    await tx.done
    if (isCurrent) forgetDb()
    db.close()
    return pending > 0 ? 'kept' : 'deleted'
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

/**
 * Lit et réécrit un enregistrement dans UNE SEULE transaction `readwrite`.
 *
 * `putLevel` remplace l'enregistrement entier (aucune fusion en base) : un
 * couple lecture/écriture séparé par un `await` laisse une fenêtre où un autre
 * flux — la sauvegarde différée de l'éditeur, le tick du moteur — écrit entre
 * les deux, et la seconde écriture efface la première. Toute la mécanique
 * `edit_seq`/`attemptedSeq` du moteur de synchronisation suppose cette
 * atomicité ; c'est ici qu'elle devient vraie.
 *
 * `fn` reçoit l'enregistrement courant (ou `undefined`) et renvoie celui à
 * écrire — ou `undefined` pour ne rien écrire. Elle doit être SYNCHRONE : une
 * attente extérieure refermerait la transaction.
 */
const mutate = (store) => async (id, fn) => {
  const tx = (await openDb()).transaction(store, 'readwrite')
  const next = fn(await tx.store.get(id))
  if (next !== undefined) await tx.store.put(next)
  await tx.done
  return next
}

export const mutateLevel = mutate('levels')
export const mutateProject = mutate('projects')
export const listLevels = async (projectId) => (await openDb()).getAllFromIndex('levels', 'project_id', projectId)

/**
 * Marqueur posé sur l'enregistrement du NIVEAU quand une image de fond existe
 * sur cet appareil. Le serveur, lui, met dans ce champ la clé de l'objet
 * stocké ; ici la valeur importe peu, seule sa présence compte — c'est ce que
 * lit `isLevelEmpty`.
 */
export const LOCAL_BACKGROUND_KEY = 'local'

/**
 * Écrit l'image de fond ET le marqueur sur le niveau, DANS LA MÊME
 * TRANSACTION. Les deux ne peuvent donc jamais divulguer l'un sans l'autre.
 *
 * Sans ce marqueur, `isLevelEmpty` — la seule notion de vacuité du projet —
 * jugeait vide un niveau portant la photo du plan papier : le nettoyage
 * automatique détruisait la photo, et pour un projet déjà synchronisé envoyait
 * `project.delete` au serveur, faisant disparaître le projet pour toute
 * l'agence et tous ses appareils. Le magasin `backgrounds` seul ne pouvait pas
 * fermer ce trou : le lire depuis `cleanupEmpty` rendrait la vacuité asynchrone
 * et dupliquerait la source de vérité.
 */
export const putBackground = async (level_id, blob, type) => {
  const tx = (await openDb()).transaction(['backgrounds', 'levels'], 'readwrite')
  await tx.objectStore('backgrounds').put({ level_id, blob, type })
  const levels = tx.objectStore('levels')
  const lv = await levels.get(level_id)
  // Pas d'enregistrement de niveau : rien à protéger du nettoyage, qui ne
  // balaie que ce que `listLevels` renvoie.
  if (lv && !lv.background_image_key) await levels.put({ ...lv, background_image_key: LOCAL_BACKGROUND_KEY })
  await tx.done
}
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

/**
 * Retire de la file toutes les opérations que `match` désigne, en une seule
 * transaction. Sert à abandonner un projet que le serveur a définitivement
 * refusé : ses opérations resteraient sinon en file, à repartir vers un projet
 * qui n'existe ni ici ni là-bas.
 */
export const dropQueued = async (match) => {
  const tx = (await openDb()).transaction('outbox', 'readwrite')
  let removed = 0
  for (const op of await tx.store.getAll()) {
    if (match(op)) {
      await tx.store.delete(op.seq)
      removed += 1
    }
  }
  await tx.done
  return removed
}

// Un niveau qui porte une image de fond ou une calibration n'est PAS vide : l'agent a
// photographié un plan et l'a mis à l'échelle pour tracer plus tard, c'est du travail.
export const isLevelEmpty = (lv) => {
  const g = lv?.geometry || {}
  const none = (a) => !(a || []).length
  return none(g.walls) && none(g.rooms) && none(g.openings)
    && !lv?.background_image_key && !lv?.calibration
}

/**
 * Tous les projets déjà présents sur cet appareil, niveaux inclus, pour la reprise
 * d'un plan existant (Task 10) quand le réseau manque : c'est alors la seule
 * source disponible, et forcément plus étroite que l'agence entière — l'appelant
 * en informe l'agent, cette fonction ne fait que renvoyer ce qu'il y a.
 */
export const listKnownProjects = async () => {
  const projects = (await listAllProjects()).filter((p) => !p.deleted)
  return Promise.all(projects.map(async (p) => ({
    id: p.id,
    title: p.title,
    levels: (await listLevels(p.id)).filter((lv) => !lv.deleted),
  })))
}

export const clearAll = async () => {
  const db = await openDb()
  await Promise.all(['projects', 'levels', 'backgrounds', 'outbox'].map((s) => db.clear(s)))
}
