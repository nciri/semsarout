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
  listCleanings: async (params = {}) => (await api.get(`${B}/menage`, { params })).data,
  getCleaning: async (id) => (await api.get(`${B}/menage/${id}`)).data,
  createCleaning: async (data) => (await api.post(`${B}/menage`, data)).data,
  updateCleaning: async (id, data) => (await api.patch(`${B}/menage/${id}`, data)).data,
  addReport: async (taskId, data) => (await api.post(`${B}/menage/${taskId}/rapports`, data)).data,
  markReportSeen: async (reportId) => (await api.post(`${B}/menage/rapports/${reportId}/vu`)).data,
  addReportPhoto: async (reportId, file) => (await api.post(
    `${B}/menage/rapports/${reportId}/photos`, file,
    { params: { filename: file.name }, headers: { 'Content-Type': file.type || 'application/octet-stream' } })).data,
  photoUrl: (photoId) => `${B}/menage/photos/${photoId}`,
}

/** Plateformes acceptées par le service (`ical.PLATFORMS`). */
export const STAY_PLATFORMS = ['airbnb', 'booking', 'vrbo', 'autre']

export const STAY_STATUS_TONE = { confirmed: 'good', blocked: 'neutral', cancelled: 'crit' }
export const SOURCE_STATUS_TONE = { ok: 'good', pending: 'neutral', error: 'crit' }

/** Déclencheurs acceptés par le service (`messages.TRIGGERS`). */
export const STAY_TRIGGERS = ['on_booking', 'before_check_in', 'after_check_out']
/** Les déclencheurs immédiats ignorent le délai : inutile de l'afficher. */
export const TRIGGER_HAS_OFFSET = { on_booking: false, before_check_in: true, after_check_out: true }
export const CLEANING_STATUS_TONE = { pending: 'neutral', in_progress: 'warn', done: 'good', cancelled: 'neutral' }
export const CLEANING_ZONES = ['chambres', 'salle_de_bain', 'cuisine', 'sejour', 'exterieur', 'linge']
export const CLEANING_REPORT_KINDS = ['issue', 'stock', 'note']

export const MESSAGE_STATUS_TONE = { sent: 'good', pending: 'neutral', no_recipient: 'warn', failed: 'crit' }
