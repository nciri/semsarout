import api from './api'

export const artisanService = {
  listTrades: async () => (await api.get('/backoffice/artisan-trades')).data,
  listArtisans: async (params = {}) => (await api.get('/backoffice/artisans', { params })).data,
  createArtisan: async (data) => (await api.post('/backoffice/artisans', data)).data,
  updateArtisan: async (id, data) => (await api.put(`/backoffice/artisans/${id}`, data)).data,
  deleteArtisan: async (id) => (await api.delete(`/backoffice/artisans/${id}`)).data,
  listWorkOrders: async (params = {}) => (await api.get('/backoffice/work-orders', { params })).data,
  createWorkOrder: async (data) => (await api.post('/backoffice/work-orders', data)).data,
  getWorkOrder: async (id) => (await api.get(`/backoffice/work-orders/${id}`)).data,
  updateWorkOrder: async (id, data) => (await api.put(`/backoffice/work-orders/${id}`, data)).data,
  deleteWorkOrder: async (id) => (await api.delete(`/backoffice/work-orders/${id}`)).data,
  listShared: async (params = {}) => (await api.get('/admin/shared-artisans', { params })).data,
  createShared: async (data) => (await api.post('/admin/shared-artisans', data)).data,
  updateShared: async (id, data) => (await api.put(`/admin/shared-artisans/${id}`, data)).data,
  deleteShared: async (id) => (await api.delete(`/admin/shared-artisans/${id}`)).data,
}
