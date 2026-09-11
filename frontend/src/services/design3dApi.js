import api from './api'

// Client HTTP pour l'éditeur de plans design3d. Toutes les routes passent par
// la passerelle sous /api/v1/design3d/... (voir gateway/app/main.py), relayées
// vers services/design3d/app/main.py — c'est ce dernier qui fait foi pour les
// formes de requête/réponse (cf. task-8-report.md pour le détail).

export const createProject = async (payload) => {
  const { data } = await api.post('/design3d/projects', payload)
  return data
}

export const listProjects = async (targetType, targetId) => {
  const { data } = await api.get('/design3d/projects', { params: { target_type: targetType, target_id: targetId } })
  return data
}

export const getProject = async (id) => {
  const { data } = await api.get(`/design3d/projects/${id}`)
  return data
}

/**
 * Tous les projets de l'agence pour la reprise d'un plan existant (Task 10), en
 * UN SEUL appel : la liste sans cible porte désormais le RÉSUMÉ de ses niveaux
 * (identifiant, nom, position, hauteur sous plafond) et jamais leur géométrie,
 * qui n'est chargée que pour le niveau effectivement choisi
 * (`getLevelGeometry`).
 *
 * C'est la correction d'un N+1 qui vidait le cache hors-ligne par la porte de
 * derrière : un `getProject` par projet, jusqu'à 51 requêtes, toutes dans le
 * cache Workbox `design3d-api` plafonné à 60 entrées (vite.config.js) — soit
 * l'éviction de tout ce que l'agent avait mis de côté pour travailler Wi-Fi
 * coupé. `listProjects()` sans cible reste borné et filtré par agence (Task 9) :
 * cette liste ne fait donc jamais fuiter un autre périmètre.
 */
export const listAgencyProjects = async () => {
  const { projects } = await listProjects()
  return projects.map((p) => ({ id: p.id, title: p.title, levels: p.levels || [] }))
}

/**
 * Le niveau CHOISI, géométrie comprise : une seule requête, celle de son projet.
 * Renvoie `null` si le niveau n'y figure plus (supprimé entre l'affichage de la
 * liste et le choix) — l'appelant doit le dire plutôt que reprendre un plan vide.
 */
export const getLevelGeometry = async (projectId, levelId) => {
  const full = await getProject(projectId)
  return (full.levels || []).find((lv) => lv.id === levelId) ?? null
}

export const updateProject = async (id, payload) => {
  const { data } = await api.put(`/design3d/projects/${id}`, payload)
  return data
}

export const deleteProject = async (id) => {
  await api.delete(`/design3d/projects/${id}`)
}

export const createLevel = async (projectId, payload) => {
  const { data } = await api.post(`/design3d/projects/${projectId}/levels`, payload)
  return data
}

export const updateLevel = async (id, body) => {
  const { data } = await api.put(`/design3d/levels/${id}`, body)
  return data
}

export const deleteLevel = async (id) => {
  await api.delete(`/design3d/levels/${id}`)
}

export const uploadBackground = async (levelId, blob, type) => {
  const formData = new FormData()
  formData.append('file', blob, `background.${type === 'image/png' ? 'png' : 'jpg'}`)
  const { data } = await api.post(`/design3d/levels/${levelId}/background`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const recalibrate = async (levelId, body) => {
  const { data } = await api.post(`/design3d/levels/${levelId}/recalibrate`, body)
  return data
}

export const listShelf = async (levelId) => {
  const { data } = await api.get(`/design3d/levels/${levelId}/shelf`)
  return data
}

export const dismissShelf = async (levelId, shelfId) => {
  const { data } = await api.post(`/design3d/levels/${levelId}/shelf/${shelfId}/dismiss`)
  return data
}

export const sync = async () => {
  const { data } = await api.get('/design3d/sync')
  return data
}
