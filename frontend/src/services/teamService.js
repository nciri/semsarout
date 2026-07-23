import api from './api'

export const teamService = {
  getTeam: async () => (await api.get('/backoffice/team')).data,
  invite: async (data) => (await api.post('/backoffice/team/invitations', data)).data,
  resendInvite: async (id) => (await api.post(`/backoffice/team/invitations/${id}/resend`)).data,
  revokeInvite: async (id) => (await api.delete(`/backoffice/team/invitations/${id}`)).data,
  createTeam: async (name) => (await api.post('/backoffice/teams', { name })).data,
  renameTeam: async (id, name) => (await api.put(`/backoffice/teams/${id}`, { name })).data,
  deleteTeam: async (id) => (await api.delete(`/backoffice/teams/${id}`)).data,
  updateMember: async (id, data) => (await api.put(`/backoffice/team/members/${id}`, data)).data,
  removeMember: async (id) => (await api.delete(`/backoffice/team/members/${id}`)).data,
}
