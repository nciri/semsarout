import api from './api'

export const availabilityService = {
  // Créneaux de l'agent connecté, servis par le service crm (l'ancien /availability/me du
  // monolithe n'existe plus).
  getMyAvailability: async () => {
    const response = await api.get('/backoffice/visits/availability')
    return response.data
  },

  updateMyAvailability: async (slots) => {
    const response = await api.put('/backoffice/visits/availability', { slots })
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
