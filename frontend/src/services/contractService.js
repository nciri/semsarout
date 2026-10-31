import api from './api'

export const contractService = {
  listTemplates: async () => (await api.get('/backoffice/contract-templates')).data,
  createTemplate: async (data) => (await api.post('/backoffice/contract-templates', data)).data,
  updateTemplate: async (id, data) => (await api.put(`/backoffice/contract-templates/${id}`, data)).data,
  deleteTemplate: async (id) => (await api.delete(`/backoffice/contract-templates/${id}`)).data,
  list: async (params = {}) => (await api.get('/backoffice/contracts', { params })).data,
  create: async (data) => (await api.post('/backoffice/contracts', data)).data,
  get: async (id) => (await api.get(`/backoffice/contracts/${id}`)).data,
  update: async (id, data) => (await api.put(`/backoffice/contracts/${id}`, data)).data,
  remove: async (id) => (await api.delete(`/backoffice/contracts/${id}`)).data,
  finalize: async (id) => (await api.post(`/backoffice/contracts/${id}/finalize`)).data,
  markSigned: async (id) => (await api.post(`/backoffice/contracts/${id}/mark-signed`)).data,
  pdfUrl: (id) => `/api/v1/backoffice/contracts/${id}/pdf`,
}
