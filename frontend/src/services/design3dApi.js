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
