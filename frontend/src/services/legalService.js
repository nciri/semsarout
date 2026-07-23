import api from './api'

export const legalService = {
  listNotaries: async () => (await api.get('/backoffice/notaries')).data,
  createNotary: async (data) => (await api.post('/backoffice/notaries', data)).data,
  updateNotary: async (id, data) => (await api.put(`/backoffice/notaries/${id}`, data)).data,
  deleteNotary: async (id) => (await api.delete(`/backoffice/notaries/${id}`)).data,
  listCases: async (params = {}) => (await api.get('/backoffice/legal-cases', { params })).data,
  createCase: async (data) => (await api.post('/backoffice/legal-cases', data)).data,
  getCase: async (id) => (await api.get(`/backoffice/legal-cases/${id}`)).data,
  updateCase: async (id, data) => (await api.put(`/backoffice/legal-cases/${id}`, data)).data,
  deleteCase: async (id) => (await api.delete(`/backoffice/legal-cases/${id}`)).data,
  addTask: async (caseId, data) => (await api.post(`/backoffice/legal-cases/${caseId}/tasks`, data)).data,
  updateTask: async (id, data) => (await api.put(`/backoffice/legal-tasks/${id}`, data)).data,
  deleteTask: async (id) => (await api.delete(`/backoffice/legal-tasks/${id}`)).data,
}
