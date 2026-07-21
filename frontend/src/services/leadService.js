import api from './api'

export const leadService = {
  // Counters for the leads badge + dashboard alert
  getSummary: async () => {
    const { data } = await api.get('/my-leads/summary')
    return data
  }
}
