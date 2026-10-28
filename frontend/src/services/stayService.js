import api from './api'

const B = '/backoffice/sejours'

export const stayService = {
  overview: async () => (await api.get(`${B}/apercu`)).data,
  listStays: async (params = {}) => (await api.get(B, { params })).data,
  listSources: async () => (await api.get(`${B}/calendriers`)).data,
  addSource: async (data) => (await api.post(`${B}/calendriers`, data)).data,
  syncSource: async (id) => (await api.post(`${B}/calendriers/${id}/sync`)).data,
  deleteSource: async (id) => (await api.delete(`${B}/calendriers/${id}`)).data,
  syncAll: async () => (await api.post(`${B}/sync`)).data,
}

/** Plateformes acceptées par le service (`ical.PLATFORMS`). */
export const STAY_PLATFORMS = ['airbnb', 'booking', 'vrbo', 'autre']

export const STAY_STATUS_TONE = { confirmed: 'good', blocked: 'neutral', cancelled: 'crit' }
export const SOURCE_STATUS_TONE = { ok: 'good', pending: 'neutral', error: 'crit' }
