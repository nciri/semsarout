import api from './api'

export const agencyMessageService = {
  getMessages: async (params = {}) => {
    const response = await api.get('/agency/messages', { params })
    return response.data
  },

  getMessage: async (messageId) => {
    const response = await api.get(`/agency/messages/${messageId}`)
    return response.data
  },

  replyToMessage: async (messageId, body) => {
    const response = await api.post(`/agency/messages/${messageId}/reply`, { body })
    return response.data
  }
}
