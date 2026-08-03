import api from './api'

export const marketService = {
  getReferences: async () => {
    const { data } = await api.get('/market/neighborhood-prices')
    return data.references || []
  },
  createReference: async (payload) => {
    const { data } = await api.post('/market/neighborhood-prices', payload)
    return data.reference
  },
  updateReference: async (id, payload) => {
    const { data } = await api.put(`/market/neighborhood-prices/${id}`, payload)
    return data.reference
  },
  deleteReference: async (id) => {
    const { data } = await api.delete(`/market/neighborhood-prices/${id}`)
    return data
  }
}
