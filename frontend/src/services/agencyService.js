import api from './api'

export const agencyService = {
  // Get paginated list of agencies
  getAgencies: async (params = {}) => {
    const response = await api.get('/agencies', { params })
    return response.data
  },

  // Get agency by slug
  getAgency: async (slug) => {
    const response = await api.get(`/agencies/${slug}`)
    return response.data.agency
  },

  // Get agency properties
  getAgencyProperties: async (slug, params = {}) => {
    const response = await api.get(`/agencies/${slug}/properties`, { params })
    return response.data
  },

  // Create agency
  createAgency: async (data) => {
    const response = await api.post('/agencies', data)
    return response.data
  },

  // Update agency
  updateAgency: async (slug, data) => {
    const response = await api.put(`/agencies/${slug}`, data)
    return response.data
  },

  // Get current user's agency
  getMyAgency: async () => {
    const response = await api.get('/my-agency')
    return response.data.agency
  },

  // Regenerate API key
  regenerateApiKey: async (slug) => {
    const response = await api.post(`/agencies/${slug}/regenerate-api-key`)
    return response.data
  }
}
