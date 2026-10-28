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
  updateContact: async (id, data) => (await api.patch(`${B}/${id}/contact`, data)).data,
  listTemplates: async () => (await api.get(`${B}/messages/modeles`)).data,
  createTemplate: async (data) => (await api.post(`${B}/messages/modeles`, data)).data,
  updateTemplate: async (id, data) => (await api.put(`${B}/messages/modeles/${id}`, data)).data,
  deleteTemplate: async (id) => (await api.delete(`${B}/messages/modeles/${id}`)).data,
  listMessages: async () => (await api.get(`${B}/messages`)).data,
}

/** Plateformes acceptées par le service (`ical.PLATFORMS`). */
export const STAY_PLATFORMS = ['airbnb', 'booking', 'vrbo', 'autre']

export const STAY_STATUS_TONE = { confirmed: 'good', blocked: 'neutral', cancelled: 'crit' }
export const SOURCE_STATUS_TONE = { ok: 'good', pending: 'neutral', error: 'crit' }

/** Déclencheurs acceptés par le service (`messages.TRIGGERS`). */
export const STAY_TRIGGERS = ['on_booking', 'before_check_in', 'after_check_out']
/** Les déclencheurs immédiats ignorent le délai : inutile de l'afficher. */
export const TRIGGER_HAS_OFFSET = { on_booking: false, before_check_in: true, after_check_out: true }
export const MESSAGE_STATUS_TONE = { sent: 'good', pending: 'neutral', no_recipient: 'warn', failed: 'crit' }
