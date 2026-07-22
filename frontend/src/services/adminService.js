import api from './api'

export const adminService = {
  getOverview: async () => (await api.get('/admin/overview')).data,
  getAccounts: async (params = {}) => (await api.get('/admin/accounts', { params })).data,
  getUser: async (id) => (await api.get(`/admin/accounts/users/${id}`)).data,
  getAgency: async (id) => (await api.get(`/admin/accounts/agencies/${id}`)).data,
  suspendUser: async (id, reason) => (await api.post(`/admin/accounts/users/${id}/suspend`, { reason })).data,
  unsuspendUser: async (id) => (await api.post(`/admin/accounts/users/${id}/unsuspend`)).data,
  deleteUser: async (id) => (await api.delete(`/admin/accounts/users/${id}`)).data,
  restoreUser: async (id) => (await api.post(`/admin/accounts/users/${id}/restore`)).data,
  anonymizeUser: async (id) => (await api.post(`/admin/accounts/users/${id}/anonymize`)).data,
  suspendAgency: async (id, reason) => (await api.post(`/admin/accounts/agencies/${id}/suspend`, { reason })).data,
  unsuspendAgency: async (id) => (await api.post(`/admin/accounts/agencies/${id}/unsuspend`)).data,
  deleteAgency: async (id) => (await api.delete(`/admin/accounts/agencies/${id}`)).data,
  restoreAgency: async (id) => (await api.post(`/admin/accounts/agencies/${id}/restore`)).data,
  getActivity: async (params = {}) => (await api.get('/admin/activity', { params })).data,
  impersonate: async (id) => (await api.post(`/admin/accounts/users/${id}/impersonate`)).data,
}
