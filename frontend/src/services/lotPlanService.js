import api from './api'

// Status colors shared by editor and viewer
export const LOT_STATUS = {
  available: { label: 'Disponible', color: '#16a34a', bg: 'bg-green-100', text: 'text-green-700' },
  reserved: { label: 'Réservé', color: '#d97706', bg: 'bg-amber-100', text: 'text-amber-700' },
  sold: { label: 'Vendu', color: '#dc2626', bg: 'bg-red-100', text: 'text-red-700' }
}

export const lotPlanService = {
  // Public — plans + lots for a program
  getPlans: async (programId) => {
    const { data } = await api.get(`/programs/${programId}/plans`)
    return data.plans || []
  },

  // Plans (owner)
  createPlan: async (programId, payload) => {
    const { data } = await api.post(`/programs/${programId}/plans`, payload)
    return data.plan
  },
  updatePlan: async (programId, planId, payload) => {
    const { data } = await api.put(`/programs/${programId}/plans/${planId}`, payload)
    return data.plan
  },
  deletePlan: async (programId, planId) => {
    const { data } = await api.delete(`/programs/${programId}/plans/${planId}`)
    return data
  },

  // Lots (owner)
  createLot: async (programId, payload) => {
    const { data } = await api.post(`/programs/${programId}/lots`, payload)
    return data.lot
  },
  updateLot: async (programId, lotId, payload) => {
    const { data } = await api.put(`/programs/${programId}/lots/${lotId}`, payload)
    return data.lot
  },
  updateLotStatus: async (programId, lotId, status) => {
    const { data } = await api.patch(`/programs/${programId}/lots/${lotId}/status`, { status })
    return data.lot
  },
  deleteLot: async (programId, lotId) => {
    const { data } = await api.delete(`/programs/${programId}/lots/${lotId}`)
    return data
  },

  // Buyer interest
  expressInterest: async (programId, payload) => {
    const { data } = await api.post(`/programs/${programId}/lots/interest`, payload)
    return data
  },

  // Upload a plan background image → returns its URL
  uploadImage: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('kind', 'photo')
    const { data } = await api.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data.url
  }
}
