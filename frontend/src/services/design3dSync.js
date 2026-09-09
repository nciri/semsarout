import * as defaultLocal from './design3dLocal'
import * as defaultApi from './design3dApi'
import { newId } from '../utils/floorplan'

const isNetworkError = (e) => !e?.response && (e?.code === 'ERR_NETWORK' || e?.message === 'net' || !navigator.onLine)

// Nombre de tours accordés à une exception du CLIENT (aucune réponse HTTP, et
// le réseau n'est pas en cause) avant mise en quarantaine. Deux exigences
// contraires : une panne passagère du stockage local, traversée par `send()`,
// ne doit pas faire jeter du travail au premier faux pas ; mais une exception
// déterministe ne doit pas rejouer à l'identique indéfiniment, ce qui gelait la
// file entière — pour tous les niveaux et tous les projets — sans autre issue
// que de vider IndexedDB.
const MAX_CLIENT_ERROR_ATTEMPTS = 3

let failures = 0

// Point d'entrée unique pour toute mutation de l'éditeur : écrit d'abord en
// local (IndexedDB), l'UI ne dépend jamais du réseau, puis empile l'opération
// dans la file d'attente pour rejeu par le moteur de synchronisation.
export async function applyLocal(op, { local = defaultLocal } = {}) {
  const p = op.payload
  let toEnqueue = op
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
        // Ce niveau-là n'a jamais été soumis au serveur : `ProjectCreateIn` ne
        // porte pas d'identifiant de niveau initial, c'est le serveur qui crée
        // le sien. Le drapeau permet à send() de reconnaître, dans la réponse de
        // création, à quel niveau local rattacher l'identité serveur.
        seeded: true,
      })
      break
    }
    case 'project.update': {
      // Même compteur d'édition que pour les niveaux : il permet à send()
      // de reconnaître une édition survenue pendant qu'une requête portant
      // l'état précédent était en vol. Lu et réécrit dans une seule
      // transaction, faute de quoi deux éditions rapprochées liraient le même
      // compteur et la première serait perdue.
      await local.mutateProject(p.id, (cur0) => {
        const cur = cur0 ?? { id: p.id }
        // eslint-disable-next-line no-unused-vars -- déstructuration volontaire pour omettre `sync_error`
        const { sync_error, ...curRest } = cur
        // Comme pour un niveau, une nouvelle édition rend caduque la trace d'un
        // échec dépassé — SAUF quand c'est la création elle-même qui a été
        // refusée : `targetRefusalError` s'appuie sur cette trace pour ne pas
        // laisser partir des opérations vers un projet qui n'existe pas côté
        // serveur (le défaut C1). Ce refus-là n'est levé que par l'abandon
        // explicite du projet (discardRefusedProject).
        return { ...(cur.synced ? curRest : cur), ...p, edit_seq: (cur.edit_seq ?? 0) + 1 }
      })
      break
    }
    case 'project.delete':
      await local.deleteProjectLocal(p.id)
      break
    case 'level.create':
      await local.putLevel({ revision: 0, base_revision: 0, dirty: false, ...p })
      break
    case 'level.update': {
      // `edit_seq` compte les éditions locales successives de ce niveau. On
      // rattache l'opération à la valeur qu'elle produit (`client_seq`) pour
      // pouvoir, plus tard, distinguer une opération réellement redondante
      // (son contenu a déjà été transmis) d'une opération dont l'entité
      // paraît juste « propre » à cet instant — cf. runOnce/send. Lecture et
      // écriture dans la même transaction : deux éditions concurrentes qui
      // liraient le même compteur en produiraient un seul, et l'une des deux
      // serait comptée comme déjà transmise sans l'avoir jamais été.
      const next = await local.mutateLevel(p.id, (cur0) => {
        const cur = cur0 ?? { id: p.id, revision: 0 }
        // eslint-disable-next-line no-unused-vars -- déstructuration volontaire pour omettre `sync_error`
        const { sync_error, ...curRest } = cur
        // Une nouvelle édition locale purge la trace d'un échec révolu :
        // sinon l'interface afficherait l'erreur d'une tentative dépassée à
        // côté d'un état qui vient d'être modifié à nouveau.
        return {
          ...curRest, ...p,
          base_revision: cur.dirty ? cur.base_revision : cur.revision,
          dirty: true,
          edit_seq: (cur.edit_seq ?? 0) + 1,
        }
      })
      toEnqueue = { ...op, client_seq: next.edit_seq }
      break
    }
    case 'level.delete':
      await local.mutateLevel(p.id, (cur) => ({ ...cur, id: p.id, deleted: true }))
      break
    case 'level.background':
      await local.putBackground(p.id, p.blob, p.type)
      break
    default:
      throw new Error(`op inconnue: ${op.type}`)
  }
  await local.enqueue(toEnqueue)
}

// Persiste un échec non rejouable (422/403/404/…) sur l'entité locale
// concernée, pour qu'il survive à un rechargement de page — sans ce champ,
// l'opération retirée de la file disparaît sans laisser de trace et le
// travail local devient invisible (cf. revue tâche 8).
//
// `attemptedSeq` est l'`edit_seq` du niveau tel qu'il était au moment où LA
// REQUÊTE QUI VIENT D'ÉCHOUER a été envoyée (capturé dans send(), avant tout
// await réseau). S'il diffère de l'`edit_seq` courant de l'entité, c'est que
// l'utilisateur a réédité pendant que cette requête était en vol : une
// opération plus récente est encore en file pour cette édition-là, et il ne
// faut surtout pas la faire passer pour « déjà à jour » en effaçant `dirty`
// — ce serait la perdre silencieusement au prochain passage de la file
// (cf. revue tâche 8, round 2).
async function markSyncError(op, error, local, attemptedSeq, kind = null) {
  const status = error?.response?.status
  const data = error?.response?.data
  const message = data?.error ?? error?.message ?? 'Erreur de synchronisation'
  const sync_error = {
    code: status,
    message,
    at: Date.now(),
    // Le serveur détaille ce qui cloche (422 : `details`, cf. main.py) ; sans
    // ces lignes, l'agent apprend qu'il y a un problème mais pas lequel.
    ...(Array.isArray(data?.details) && data.details.length ? { details: data.details } : {}),
    // `kind: 'client'` marque une exception du client mise en quarantaine : son
    // message est un texte technique, que l'interface ne doit pas servir tel
    // quel à un agent. Il reste consigné pour le diagnostic.
    ...(kind ? { kind } : {}),
  }
  const id = op.payload?.id
  if (!id) return
  if (op.type.startsWith('level.')) {
    // Le test de supersession et l'écriture sont dans la même transaction :
    // une édition survenue entre les deux serait sinon marquée « propre »,
    // donc écrasable par le prochain rafraîchissement, sans avoir été envoyée.
    await local.mutateLevel(id, (cur) => {
      if (!cur) return undefined
      const supersededByNewerEdit = attemptedSeq != null && (cur.edit_seq ?? 0) > attemptedSeq
      // Une édition plus récente existe déjà (encore en file) : on note
      // l'échec pour information mais on laisse `dirty` tel quel, pour que
      // cette édition plus récente soit bien envoyée au prochain tour.
      if (supersededByNewerEdit) return { ...cur, sync_error }
      // Aucune édition n'est survenue depuis la tentative ratée : le niveau
      // redevient rafraîchissable par le serveur (dirty: false) plutôt que
      // bloqué en édition invisible pour toujours — l'opération qui a
      // échoué ne se rejouera jamais telle quelle (422/403/404 sont
      // définitifs), donc continuer à le protéger du rafraîchissement ne
      // ferait qu'enterrer la donnée. La tentative ratée reste consultable
      // via `sync_error` ; si l'utilisateur rouvre l'éditeur et corrige,
      // une nouvelle édition remettra `dirty: true` normalement.
      return { ...cur, dirty: false, sync_error }
    })
  } else if (op.type.startsWith('project.')) {
    await local.mutateProject(id, (cur) => (cur ? { ...cur, sync_error } : undefined))
  }
}

// Identifiant du niveau tel que LE SERVEUR le connaît. Il ne diffère de la clé
// locale que pour le niveau initial d'un projet, dont le serveur est seul auteur
// de l'identité (cf. adoptInitialLevel).
export async function remoteLevelId(id, local = defaultLocal) {
  return (await local.getLevel(id))?.server_id ?? id
}

// Fusionne la version renvoyée par le serveur dans l'enregistrement local sans
// jamais laisser l'identité serveur écraser la clé locale : `to_dict()` renvoie
// `id` (celui du serveur), et l'écrire tel quel créerait un doublon de niveau.
const mergedWithServer = (cur, server, extra = {}) => ({
  ...cur,
  ...server,
  id: cur.id,
  ...(cur.server_id ? { server_id: cur.server_id } : {}),
  ...extra,
})

// Reporte sur le niveau initial local l'identité du niveau que le serveur vient
// de créer avec le projet.
//
// `POST /design3d/projects` crée toujours un niveau « RDC » avec son propre UUID
// (services/design3d/app/main.py) et `ProjectCreateIn` n'offre aucun champ pour
// lui imposer celui tiré côté client. Sans ce report, chaque `PUT` sur le niveau
// initial partait donc vers un identifiant que le serveur n'a jamais connu : 404
// définitif, opération retirée de la file, et tout le plan dessiné sur le RDC de
// chaque projet restait prisonnier de l'IndexedDB de l'appareil — pour de bon.
//
// C'est bien le serveur qui fait autorité : son identifiant est celui employé
// pour toute opération réseau. L'enregistrement local, lui, garde sa clé — le
// contenu en cours d'édition, la file d'attente, l'image de fond et l'onglet
// ouvert dans l'éditeur y sont tous rattachés, et une bascule de clé les
// perdrait au premier enregistrement différé encore en vol.
async function adoptInitialLevel(projectId, serverLevels, local) {
  const initial = serverLevels?.[0]
  if (!initial) return
  const seeded = (await local.listLevels(projectId)).find((lv) => lv.seeded && !lv.server_id)
  if (!seeded) return
  // Relecture DANS la transaction d'écriture : le dessin en cours ne doit pas
  // être remplacé par l'instantané lu avant la requête (putLevel remplace
  // l'enregistrement entier).
  await local.mutateLevel(seeded.id, (cur0) => {
    const cur = cur0 ?? seeded
    return { ...cur, server_id: initial.id, revision: initial.revision ?? 0, base_revision: initial.revision ?? 0 }
  })
}

// Le projet a-t-il été définitivement refusé par le serveur à sa création
// (cible hors périmètre de l'agence/propriétaire, cf. C3, 403) ? `synced`
// n'est posé qu'après une création réussie : s'il est toujours faux alors
// qu'un `sync_error` de code 403 est déjà consigné, la création n'a jamais
// abouti et n'aboutira jamais — un `project.update` refusé pour une tout
// autre raison, lui, laisse `synced` à `true`, donc ne déclenche pas ce
// court-circuit.
async function targetRefusalError(projectId, local) {
  if (!projectId) return null
  const proj = await local.getProject(projectId)
  if (!proj || proj.synced || proj.sync_error?.code !== 403) return null
  // Sans ce court-circuit, toute opération sur un niveau de ce projet (déjà
  // en file, ou empilée par une édition ultérieure) partirait vers un projet
  // qui n'a jamais existé côté serveur et recevrait un 404 sans rapport avec
  // la vraie cause — masquant le refus de cible derrière une erreur « Not
  // Found » trompeuse, et rejouant ainsi exactement le défaut C1 (travail
  // piégé côté client, sans que la trace conservée (`sync_error`) n'en
  // explique la vraie raison) sur ce cas précis.
  return Object.assign(new Error(proj.sync_error.message), {
    response: { status: 403, data: { error: proj.sync_error.message } },
  })
}

/**
 * Abandonne un projet dont la CRÉATION a été définitivement refusée (403 de
 * cible), avec tout ce qui en dépend : niveaux, images de fond, opérations
 * encore en file.
 *
 * C'est la seule sortie de ce cul-de-sac : aucun chemin de l'application ne
 * réenfile un `project.create`, et `targetRefusalError` court-circuite pour
 * toujours toute opération de tous les niveaux du projet. Sans elle, l'agent
 * reste devant un projet qui ne partira jamais et qu'il ne peut pas retirer.
 *
 * Le refus définitif est revérifié ici : cette fonction ne doit jamais pouvoir
 * servir à supprimer un projet que le serveur connaît, dont le travail serait
 * alors détruit sans copie. Renvoie `true` si l'abandon a bien eu lieu.
 */
export async function discardRefusedProject(projectId, { local = defaultLocal } = {}) {
  if (!projectId) return false
  const proj = await local.getProject(projectId)
  if (!proj || proj.synced || proj.sync_error?.code !== 403) return false
  const levelIds = new Set((await local.listLevels(projectId)).map((lv) => lv.id))
  await local.dropQueued((op) => {
    const p = op.payload ?? {}
    return p.id === projectId || p.project_id === projectId || levelIds.has(p.id)
  })
  await local.deleteProjectLocal(projectId)
  return true
}

async function send(op, api, local) {
  const p = op.payload
  switch (op.type) {
    case 'project.create': {
      const attemptedSeq = (await local.getProject(p.id))?.edit_seq ?? 0
      const r = await api.createProject(p)
      await adoptInitialLevel(p.id, r.levels, local)
      // Comparaison et écriture dans la même transaction : une édition glissée
      // entre les deux serait sinon écrasée par l'écho du serveur.
      await local.mutateProject(p.id, (after) => {
        if ((after?.edit_seq ?? 0) > attemptedSeq) {
          // La réponse du serveur n'est que l'écho de ce qui a été envoyé avant
          // l'édition concurrente : elle ne doit pas restaurer le titre d'avant.
          // Le local (plus récent) gagne champ par champ ; on ne prend du
          // serveur que les champs qu'il est seul à connaître (created_at,
          // owner_id, tenant…). L'opération `project.update` encore en file
          // transmettra le nouveau contenu.
          return { ...r, ...after, synced: true }
        }
        return { ...after, ...r, synced: true }
      })
      return
    }
    case 'project.update': {
      const refused = await targetRefusalError(p.id, local)
      if (refused) throw refused
      await api.updateProject(p.id, p)
      return
    }
    case 'project.delete': {
      const refused = await targetRefusalError(p.id, local)
      if (refused) throw refused
      await api.deleteProject(p.id)
      return
    }
    case 'level.create': {
      const refused = await targetRefusalError(p.project_id, local)
      if (refused) throw refused
      await api.createLevel(p.project_id, p)
      return
    }
    case 'level.update': {
      const cur = await local.getLevel(p.id)
      if (!cur) return undefined
      const refused = await targetRefusalError(cur.project_id, local)
      if (refused) {
        refused.attemptedSeq = cur.edit_seq ?? 0
        throw refused
      }
      // Dédoublonnage : deux éditions consécutives du même niveau, empilées
      // avant toute synchronisation, partagent la même entité locale
      // (fusionnée par applyLocal). On ne saute l'envoi que si le contenu
      // de CETTE opération précise a déjà été transmis par une opération
      // antérieure du même lot — jamais simplement parce que l'entité
      // paraît « propre » à cet instant (`dirty: false` peut aussi venir
      // d'un échec définitif traité entre-temps, cf. markSyncError, auquel
      // cas cette opération peut porter une édition jamais envoyée).
      // `synced_seq` n'est posé que par un envoi réussi juste en dessous :
      // c'est la seule preuve fiable qu'un `edit_seq` donné a atteint le
      // serveur.
      if (op.client_seq != null && cur.synced_seq != null && op.client_seq <= cur.synced_seq) {
        return undefined
      }
      // L'edit_seq réellement transmis par cette tentative, figé avant tout
      // await réseau : sert aussi bien à markSyncError (chemins d'échec) qu'à
      // la réécriture ci-dessous (chemin du succès).
      const attemptedSeq = cur.edit_seq ?? 0
      let r
      try {
        r = await api.updateLevel(cur.server_id ?? p.id, {
          base_revision: cur.base_revision ?? 0,
          name: cur.name,
          position: cur.position,
          wall_height_m: cur.wall_height_m,
          calibration: cur.calibration,
          geometry: cur.geometry,
          show_background_public: cur.show_background_public,
        })
      } catch (e) {
        e.attemptedSeq = attemptedSeq
        throw e
      }
      // `cur` est une copie d'AVANT la requête, et putLevel remplace
      // l'enregistrement entier (aucune fusion en base) : réécrire `cur` ici
      // restaurerait l'état d'avant une éventuelle édition concurrente. On
      // relit donc l'entité après l'attente réseau — et dans la transaction
      // qui la réécrit, sinon la fenêtre entre relecture et écriture rouvre
      // exactement le trou que cette relecture voulait fermer.
      await local.mutateLevel(p.id, (cur0) => {
        const after = cur0 ?? cur
        if ((after.edit_seq ?? 0) > attemptedSeq) {
          // L'utilisateur a réédité pendant que la requête était en vol : son
          // contenu et son `edit_seq` doivent survivre intacts (l'opération
          // correspondante est encore en file). Du succès on ne retient que ce
          // qui reste pertinent, c'est-à-dire l'information de synchronisation
          // venue du serveur : la révision atteinte — reportée aussi sur
          // `base_revision`, pour que l'édition en attente reparte sur la bonne
          // base et ne se heurte pas à un 409 immédiat — et `synced_seq`, qui
          // n'acquitte que la séquence réellement transmise (donc sans jamais
          // faire sauter l'édition plus récente au dédoublonnage). `dirty`
          // reste vrai : cette édition-là n'a pas encore atteint le serveur.
          return { ...after, revision: r.revision, base_revision: r.revision, synced_seq: attemptedSeq }
        }
        // eslint-disable-next-line no-unused-vars -- déstructuration volontaire pour omettre `sync_error`
        const { sync_error, ...rest } = after
        return mergedWithServer(rest, r, { base_revision: r.revision, dirty: false, synced_seq: attemptedSeq })
      })
      return r.shelved ? 'shelved' : undefined
    }
    case 'level.delete': {
      const cur = await local.getLevel(p.id)
      const refused = cur && (await targetRefusalError(cur.project_id, local))
      if (refused) throw refused
      await api.deleteLevel(await remoteLevelId(p.id, local))
      return
    }
    case 'level.background': {
      const cur = await local.getLevel(p.id)
      const refused = cur && (await targetRefusalError(cur.project_id, local))
      if (refused) throw refused
      const bg = await local.getBackground(p.id)
      await api.uploadBackground(await remoteLevelId(p.id, local), bg.blob, bg.type)
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
  let hasError = false
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
        // La version que portait cette opération vient d'être archivée côté
        // serveur au profit de celle du propriétaire (main.py::_shelve). La
        // trace est persistée sur le niveau : le badge « conflit » est fugace,
        // et sans elle l'auteur n'apprend jamais ce qui est arrivé à son
        // travail — la spec §288 lui promet pourtant ce message.
        const shelved_notice = { at: Date.now(), revision: server?.revision }
        // Lecture et écriture dans une seule transaction : entre les deux, une
        // édition concurrente serait remplacée par la version serveur — la
        // perte même que la détection de supersession existe pour éviter.
        if (server) {
          await local.mutateLevel(op.payload.id, (curLevel) => {
            const supersededByNewerEdit = e.attemptedSeq != null && (curLevel?.edit_seq ?? 0) > e.attemptedSeq
            // Une édition plus récente que celle qui a été envoyée est déjà en
            // file (op suivante) : remplacer l'entité par la version serveur
            // effacerait cette édition sans trace. On garde le contenu local
            // le plus récent (donc `dirty: true`, elle sera bien renvoyée) et
            // on aligne seulement `base_revision` sur celle du serveur pour
            // que le prochain envoi ne reparte pas avec une révision déjà
            // périmée.
            if (supersededByNewerEdit) return { ...curLevel, base_revision: server.revision, shelved_notice }
            // Aucune édition plus récente : le serveur a gagné, comme convenu
            // — le travail de cette opération est archivé côté serveur
            // (cf. tâche 4), on remplace intégralement par sa version.
            return mergedWithServer(curLevel ?? { id: op.payload.id }, server, { base_revision: server.revision, dirty: false, shelved_notice })
          })
        }
        await local.remove(op.seq)
        conflict = true
        continue
      }

      if (status === 422 || status === 403 || status === 404) {
        // Opération irrécupérable côté serveur : la garder bloquerait toute
        // la file indéfiniment. On la retire, mais on persiste l'échec sur
        // l'entité locale (survit au rechargement) plutôt que de laisser
        // filer un événement éphémère — sinon le travail local devient
        // invisible et injoignable (cf. revue tâche 8).
        await markSyncError(op, e, local, e.attemptedSeq)
        await local.remove(op.seq)
        hasError = true
        onState?.({ state: 'error', error: e.response?.data, pending: await local.pendingCount() })
        continue
      }

      // Exception du client : aucune réponse HTTP, et le réseau n'est pas en
      // cause. La traiter comme une panne réseau — ce que faisait le `!status`
      // ci-dessous — la rejouait à l'identique à chaque tour, bloquait toute la
      // file et affichait « hors ligne » alors que la connexion allait bien.
      // On la retente, mais un nombre borné de fois, puis on la met en
      // quarantaine comme un échec non rejouable : l'opération est retirée et
      // la cause reste consultable sur l'entité locale (`sync_error`, cf. I2).
      if (!status && !isNetworkError(e)) {
        const attempts = await local.markAttempt(op.seq)
        hasError = true
        if (attempts < MAX_CLIENT_ERROR_ATTEMPTS) {
          // Rien n'est retiré : le travail que porte l'opération est intact,
          // le prochain tour du moteur la retentera.
          const pending = await local.pendingCount()
          onState?.({ state: 'error', error: { error: e?.message }, pending })
          return { synced, pending, conflict, hasError }
        }
        await markSyncError(op, e, local, e.attemptedSeq, 'client')
        await local.remove(op.seq)
        onState?.({ state: 'error', error: { error: e?.message }, pending: await local.pendingCount() })
        continue
      }

      // 502/503/504 : le service est momentanément indisponible, l'opération
      // n'a rien d'invalide — la retirer de la file perdrait le travail qu'elle
      // porte. C'est aussi la réponse du serveur quand il ne peut pas vérifier
      // la propriété de la cible d'un projet et refuse par prudence : ce refus
      // doit être rejouable, contrairement à un 403.
      if (isNetworkError(e) || !status || [502, 503, 504].includes(status)) {
        failures++
        const retryInMs = Math.min(2 ** failures * 1000, 300000)
        onState?.({ state: 'offline', pending: await local.pendingCount(), retryInMs })
        return { synced, pending: await local.pendingCount(), conflict, retryInMs }
      }

      // Autre erreur serveur inattendue (5xx…) : ne pas bloquer la file
      // dessus, mais la mémoriser comme pour les erreurs 4xx ci-dessus — en
      // lui transmettant aussi la séquence tentée, sinon une édition plus
      // récente encore en file se ferait à tort marquer « propre » et
      // deviendrait la cible d'un rafraîchissement concurrent.
      await markSyncError(op, e, local, e.attemptedSeq)
      await local.remove(op.seq)
      hasError = true
      onState?.({ state: 'error', error: e.response?.data, pending: await local.pendingCount() })
    }
  }
  const pending = await local.pendingCount()
  const state = conflict ? 'conflict' : hasError ? 'error' : 'synced'
  onState?.({ state, pending, at: Date.now() })
  return { synced, pending, conflict, hasError }
}

// Recharge depuis le serveur les niveaux dont la révision a avancé, sans
// jamais écraser un niveau modifié localement et non encore synchronisé.
export async function refreshFromServer({ api = defaultApi, local = defaultLocal, onShelved } = {}) {
  const { projects } = await api.sync()
  for (const p of projects) {
    // Le niveau initial adopté garde sa clé locale et porte l'identité serveur
    // dans `server_id` : sans cette résolution, le niveau renvoyé par le serveur
    // serait inséré une seconde fois et le projet afficherait deux onglets
    // « RDC » indiscernables, dont un seul porterait le travail.
    const localLevels = await local.listLevels(p.id)
    const byServerId = new Map(localLevels.filter((l) => l.server_id).map((l) => [l.server_id, l]))
    // Rattrapage : le projet existe déjà côté serveur alors que l'adoption de son
    // niveau initial n'a pas encore eu lieu — réponse de création encore en vol,
    // retour vers la liste des projets (qui appelle `refreshFromServer` hors moteur,
    // cf. DesignProjects.jsx) ou second onglet. Quand les deux côtés n'ont qu'un
    // seul niveau et que le nôtre est celui semé à la création, ce sont
    // nécessairement les mêmes : on adopte au lieu d'insérer, sans quoi le niveau
    // serveur deviendrait un second enregistrement — le double « RDC » de C1, par
    // une autre porte. Toute situation plus riche retombe sur le comportement
    // normal, faute de pouvoir apparier de façon certaine.
    const unadopted = localLevels.filter((l) => l.seeded && !l.server_id)
    if (unadopted.length === 1 && localLevels.length === 1 && p.levels.length === 1) {
      const adopted = await local.mutateLevel(unadopted[0].id, (cur0) => {
        const cur = cur0 ?? unadopted[0]
        return {
          ...cur,
          server_id: p.levels[0].id,
        // Aligné sur adoptInitialLevel : sans ce report, un niveau non modifié
        // depuis la création (dirty: false, revision: 0) serait ensuite jugé
        // périmé par la boucle ci-dessous (`lv.revision > cur.revision`) dès
        // que le serveur avance sa révision, et écrasé par un `getProject`
        // dont l'objet fusionné garde heureusement `server_id` — mais autant
          // partir sur la même base que le reste du fichier.
          revision: cur.dirty ? cur.revision : (p.levels[0].revision ?? cur.revision),
          base_revision: cur.dirty ? cur.base_revision : (p.levels[0].revision ?? cur.base_revision),
        }
      })
      byServerId.set(p.levels[0].id, adopted)
    }
    for (const lv of p.levels) {
      const cur = (await local.getLevel(lv.id)) ?? byServerId.get(lv.id)
      if (lv.shelved_count > 0) onShelved?.(cur?.id ?? lv.id, lv.shelved_count)
      if (cur?.dirty) continue
      if (!cur || lv.revision > cur.revision) {
        const full = await api.getProject(p.id)
        const fresh = full.levels.find((l) => l.id === lv.id)
        if (fresh) {
          // `cur` a été lu AVANT l'appel réseau : le niveau a pu être dessiné
          // entre-temps. L'état est donc relu — et le test de saleté refait —
          // dans la transaction qui écrit, sinon l'édition en cours serait
          // remplacée par la version serveur sans laisser de trace.
          await local.mutateLevel(cur?.id ?? fresh.id, (now) => {
            if (now?.dirty) return undefined
            // Un rafraîchissement de fond n'acquitte jamais une erreur de
            // synchronisation : la trace de l'échec (`sync_error`) doit
            // rester consultable après coup, même quand le contenu du niveau
            // est remplacé par la version serveur — sinon la preuve de
            // l'échec disparaît avant même que l'utilisateur ne l'ait vue
            // (cf. revue tâche 8, round 2). Seul un nouvel envoi réussi
            // (send(), ci-dessus) l'efface explicitement.
            return mergedWithServer(now ?? cur ?? { id: fresh.id }, fresh, {
              base_revision: fresh.revision,
              dirty: false,
              ...(now?.sync_error ? { sync_error: now.sync_error } : {}),
            })
          })
        }
        // eslint-disable-next-line no-unused-vars -- déstructuration volontaire pour omettre `levels`
        const { levels, ...projectFields } = full
        await local.mutateProject(p.id, (curProject) => ({ ...curProject, ...projectFields, synced: true }))
      }
    }
  }
}

export function startEngine({ api = defaultApi, local = defaultLocal, onState, intervalMs = 30000 } = {}) {
  let running = false
  const tick = async () => {
    if (running) return
    if (!navigator.onLine) {
      // Hors ligne, aucune requête n'est tentée — mais le badge doit tout de
      // même dire combien d'éditions attendent. Sans cet appel il resterait
      // figé sur « À jour » pendant qu'on dessine Wi-Fi coupé (cf. tâche 11).
      onState?.({ state: 'offline', pending: await local.pendingCount() })
      return
    }
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
  const onOffline = () => tick()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') tick()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibility)
  const timer = setInterval(tick, intervalMs)
  tick()
  return {
    tick,
    stop() {
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
