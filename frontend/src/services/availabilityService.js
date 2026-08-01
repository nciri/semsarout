import api from './api'

export const availabilityService = {
  getMyAvailability: async () => {
    const response = await api.get('/availability/me')
    return response.data
  },

  updateMyAvailability: async (slots) => {
    const response = await api.put('/availability/me', { slots })
    return response.data
  },

  getAvailableSlots: async (propertyId, date) => {
    const response = await api.get(`/properties/${propertyId}/available-slots`, { params: { date } })
    return response.data
  },

  bookVisit: async (propertyId, data) => {
    const response = await api.post(`/properties/${propertyId}/book-visit`, data)
    return response.data
  }
}
