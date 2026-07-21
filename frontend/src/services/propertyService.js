import api from './api'

export const propertyService = {
  // Get paginated list of properties with filters
  getProperties: async (params = {}) => {
    const response = await api.get('/properties', { params })
    return response.data
  },

  // Get single property by ID
  getProperty: async (id) => {
    const response = await api.get(`/properties/${id}`)
    return response.data.property
  },

  // Create new property
  createProperty: async (data) => {
    const response = await api.post('/properties', data)
    return response.data
  },

  // Update property
  updateProperty: async (id, data) => {
    const response = await api.put(`/properties/${id}`, data)
    return response.data
  },

  // Delete property
  deleteProperty: async (id) => {
    const response = await api.delete(`/properties/${id}`)
    return response.data
  },

  // Publish property
  publishProperty: async (id) => {
    const response = await api.post(`/properties/${id}/publish`)
    return response.data
  },

  // Get current user's properties
  getMyProperties: async (params = {}) => {
    const response = await api.get('/my-properties', { params })
    return response.data
  },

  // Contact property owner/agency
  contactProperty: async (propertyId, data) => {
    const response = await api.post(`/properties/${propertyId}/contact`, data)
    return response.data
  },

  // Reveal owner/agency phone number
  revealPhone: async (propertyId, data = {}) => {
    const response = await api.post(`/properties/${propertyId}/reveal-phone`, data)
    return response.data
  }
}
