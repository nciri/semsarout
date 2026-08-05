import api from './api'

// N'envoie que les filtres renseignés (évite ?agent=&city= inutiles).
const clean = (params = {}) => {
  const out = {}
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) out[k] = v })
  if (!out.range) out.range = '12m'
  return out
}

export const analyticsService = {
  getFinancial: async (params) => (await api.get('/backoffice/analytics/financial', { params: clean(params) })).data,
  getMarket: async (params) => (await api.get('/backoffice/analytics/market', { params: clean(params) })).data,
  getPipeline: async (params) => (await api.get('/backoffice/analytics/pipeline', { params: clean(params) })).data,
  getTeam: async (params) => (await api.get('/backoffice/analytics/team', { params: clean(params) })).data,
  getOverview: async () => (await api.get('/backoffice/analytics/overview')).data,
  getConfig: async () => (await api.get('/backoffice/dashboard/config')).data,
  saveConfig: async (widgets) => (await api.put('/backoffice/dashboard/config', { widgets })).data,
}

export default analyticsService
