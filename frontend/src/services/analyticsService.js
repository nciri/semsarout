import api from './api'

export const analyticsService = {
  getFinancial: async (range = '12m') => (await api.get('/backoffice/analytics/financial', { params: { range } })).data,
  getMarket: async (range = '12m') => (await api.get('/backoffice/analytics/market', { params: { range } })).data,
  getPipeline: async (range = '12m') => (await api.get('/backoffice/analytics/pipeline', { params: { range } })).data,
  getTeam: async (range = '12m') => (await api.get('/backoffice/analytics/team', { params: { range } })).data,
  getOverview: async () => (await api.get('/backoffice/analytics/overview')).data,
  getConfig: async () => (await api.get('/backoffice/dashboard/config')).data,
  saveConfig: async (widgets) => (await api.put('/backoffice/dashboard/config', { widgets })).data,
}

export default analyticsService
