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
      })
      break
    }
    case 'project.update': {
      const cur = (await local.getProject(p.id)) ?? { id: p.id }
      // Même compteur d'édition que pour les niveaux : il permet à send()
      // de reconnaître une édition survenue pendant qu'une requête portant
      // l'état précédent était en vol.
      await local.putProject({ ...cur, ...p, edit_seq: (cur.edit_seq ?? 0) + 1 })
      break
    }
    case 'project.delete':
      await local.deleteProjectLocal(p.id)
      break
    case 'level.create':
      await local.putLevel({ revision: 0, base_revision: 0, dirty: false, ...p })
      break
    case 'level.update': {
      const cur = (await local.getLevel(p.id)) ?? { id: p.id, revision: 0 }
      // `edit_seq` compte les éditions locales successives de ce niveau. On
      // rattache l'opération à la valeur qu'elle produit (`client_seq`) pour
      // pouvoir, plus tard, distinguer une opération réellement redondante
      // (son contenu a déjà été transmis) d'une opération dont l'entité
      // paraît juste « propre » à cet instant — cf. runOnce/send.
      const edit_seq = (cur.edit_seq ?? 0) + 1
      // eslint-disable-next-line no-unused-vars -- déstructuration volontaire pour omettre `sync_error`
      const { sync_error, ...curRest } = cur
      // Une nouvelle édition locale purge la trace d'un échec révolu :
      // sinon l'interface afficherait l'erreur d'une tentative dépassée à
      // côté d'un état qui vient d'être modifié à nouveau.
      await local.putLevel({ ...curRest, ...p, base_revision: cur.dirty ? cur.base_revision : cur.revision, dirty: true, edit_seq })
      toEnqueue = { ...op, client_seq: edit_seq }
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
async function markSyncError(op, error, local, attemptedSeq) {
  const status = error?.response?.status
  const message = error?.response?.data?.error ?? error?.message ?? 'Erreur de synchronisation'
  const sync_error = { code: status, message, at: Date.now() }
  const id = op.payload?.id
  if (!id) return
  if (op.type.startsWith('level.')) {
    const cur = await local.getLevel(id)
    if (!cur) return
    const supersededByNewerEdit = attemptedSeq != null && (cur.edit_seq ?? 0) > attemptedSeq
    if (supersededByNewerEdit) {
      // Une édition plus récente existe déjà (encore en file) : on note
      // l'échec pour information mais on laisse `dirty` tel quel, pour que
      // cette édition plus récente soit bien envoyée au prochain tour.
      await local.putLevel({ ...cur, sync_error })
    } else {
      // Aucune édition n'est survenue depuis la tentative ratée : le niveau
      // redevient rafraîchissable par le serveur (dirty: false) plutôt que
      // bloqué en édition invisible pour toujours — l'opération qui a
      // échoué ne se rejouera jamais telle quelle (422/403/404 sont
      // définitifs), donc continuer à le protéger du rafraîchissement ne
      // ferait qu'enterrer la donnée. La tentative ratée reste consultable
      // via `sync_error` ; si l'utilisateur rouvre l'éditeur et corrige,
      // une nouvelle édition remettra `dirty: true` normalement.
      await local.putLevel({ ...cur, dirty: false, sync_error })
    }
  } else if (op.type.startsWith('project.')) {
    const cur = await local.getProject(id)
    if (cur) await local.putProject({ ...cur, sync_error })
  }
}

async function send(op, api, local) {
  const p = op.payload
  switch (op.type) {
    case 'project.create': {
      const attemptedSeq = (await local.getProject(p.id))?.edit_seq ?? 0
      const r = await api.createProject(p)
      const after = await local.getProject(p.id)
      if ((after?.edit_seq ?? 0) > attemptedSeq) {
        // La réponse du serveur n'est que l'écho de ce qui a été envoyé avant
        // l'édition concurrente : elle ne doit pas restaurer le titre d'avant.
        // Le local (plus récent) gagne champ par champ ; on ne prend du
        // serveur que les champs qu'il est seul à connaître (created_at,
        // owner_id, tenant…). L'opération `project.update` encore en file
        // transmettra le nouveau contenu.
        await local.putProject({ ...r, ...after, synced: true })
        return
      }
      await local.putProject({ ...after, ...r, synced: true })
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
      if (!cur) return undefined
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
        r = await api.updateLevel(p.id, {
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
      // restaurerait l'état d'avant une éventuelle édition concurrente.
      // On relit donc l'entité après l'attente réseau.
      const after = (await local.getLevel(p.id)) ?? cur
      if ((after.edit_seq ?? 0) > attemptedSeq) {
        // L'utilisateur a réédité pendant que la requête était en vol : son
        // contenu et son `edit_seq` doivent survivre intacts (l'opération
        // correspondante est encore en file). Du succès on ne retient que ce
        // qui reste pertinent, c'est-à-dire l'information de synchronisation
        // venue du serveur : la révision atteinte — reportée aussi sur
        // `base_revision`, pour que l'édition en attente reparte sur la bonne
        // base et ne se heurte pas à un 409 immédiat — et `synced_seq`, qui
        // n'acquitte que la séquence réellement transmise (donc sans jamais
        // faire sauter l'édition plus récente au dédoublonnage). `dirty` reste
        // vrai : cette édition-là n'a pas encore atteint le serveur.
        await local.putLevel({ ...after, revision: r.revision, base_revision: r.revision, synced_seq: attemptedSeq })
        return r.shelved ? 'shelved' : undefined
      }
      // eslint-disable-next-line no-unused-vars -- déstructuration volontaire pour omettre `sync_error`
      const { sync_error, ...rest } = after
      await local.putLevel({ ...rest, ...r, base_revision: r.revision, dirty: false, synced_seq: attemptedSeq })
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
        const curLevel = await local.getLevel(op.payload.id)
        const supersededByNewerEdit = e.attemptedSeq != null && (curLevel?.edit_seq ?? 0) > e.attemptedSeq
        if (supersededByNewerEdit) {
          // Une édition plus récente que celle qui a été envoyée est déjà en
          // file (op suivante) : remplacer l'entité par la version serveur
          // effacerait cette édition sans trace. On garde le contenu local
          // le plus récent (donc `dirty: true`, elle sera bien renvoyée) et
          // on aligne seulement `base_revision` sur celle du serveur pour
          // que le prochain envoi ne reparte pas avec une révision déjà
          // périmée.
          if (server) await local.putLevel({ ...curLevel, base_revision: server.revision })
        } else if (server) {
          // Aucune édition plus récente : le serveur a gagné, comme convenu
          // — le travail de cette opération est archivé côté serveur
          // (cf. tâche 4), on remplace intégralement par sa version.
          await local.putLevel({ ...server, base_revision: server.revision, dirty: false })
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

      if (isNetworkError(e) || !status) {
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
    for (const lv of p.levels) {
      const cur = await local.getLevel(lv.id)
      if (lv.shelved_count > 0) onShelved?.(lv.id, lv.shelved_count)
      if (cur?.dirty) continue
      if (!cur || lv.revision > cur.revision) {
        const full = await api.getProject(p.id)
        const fresh = full.levels.find((l) => l.id === lv.id)
        if (fresh) {
          // Un rafraîchissement de fond n'acquitte jamais une erreur de
          // synchronisation : la trace de l'échec (`sync_error`) doit
          // rester consultable après coup, même quand le contenu du niveau
          // est remplacé par la version serveur — sinon la preuve de
          // l'échec disparaît avant même que l'utilisateur ne l'ait vue
          // (cf. revue tâche 8, round 2). Seul un nouvel envoi réussi
          // (send(), ci-dessus) l'efface explicitement.
          await local.putLevel({
            ...fresh,
            base_revision: fresh.revision,
            dirty: false,
            ...(cur?.sync_error ? { sync_error: cur.sync_error } : {}),
          })
        }
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
