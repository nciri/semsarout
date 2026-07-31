import api from './api'

export const buyerService = {
  // Favorites
  getFavorites: async (params = {}) => {
    const response = await api.get('/buyer/favorites', { params })
    return response.data
  },

  addFavorite: async (propertyId, data = {}) => {
    const response = await api.post('/buyer/favorites', { property_id: propertyId, ...data })
    return response.data
  },

  removeFavorite: async (favoriteId) => {
    const response = await api.delete(`/buyer/favorites/${favoriteId}`)
    return response.data
  },

  // Saved searches
  getSavedSearches: async (params = {}) => {
    const response = await api.get('/buyer/saved-searches', { params })
    return response.data
  },

  createSavedSearch: async (data) => {
    const response = await api.post('/buyer/saved-searches', data)
    return response.data
  },

  deleteSavedSearch: async (searchId) => {
    const response = await api.delete(`/buyer/saved-searches/${searchId}`)
    return response.data
  },

  // Messages
  getMessages: async (params = {}) => {
    const response = await api.get('/buyer/messages', { params })
    return response.data
  },

  getMessage: async (messageId) => {
    const response = await api.get(`/buyer/messages/${messageId}`)
    return response.data
  },

  sendMessage: async (data) => {
    const response = await api.post('/buyer/messages', data)
    return response.data
  },

  replyToMessage: async (messageId, body) => {
    const response = await api.post(`/buyer/messages/${messageId}/reply`, { body })
    return response.data
  },

  // Estimates
  getEstimates: async (params = {}) => {
    const response = await api.get('/buyer/estimates', { params })
    return response.data
  },

  createEstimate: async (data) => {
    const response = await api.post('/buyer/estimates', data)
    return response.data
  }
}
