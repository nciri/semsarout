import api from './api'

const B = '/backoffice/sejours'

export const stayService = {
  overview: async () => (await api.get(`${B}/apercu`)).data,
  listStays: async (params = {}) => (await api.get(B, { params })).data,
  getStay: async (id) => (await api.get(`${B}/${id}`)).data,
  createStay: async (data) => (await api.post(B, data)).data,
  updateStay: async (id, data) => (await api.put(`${B}/${id}`, data)).data,
  cancelStay: async (id) => (await api.post(`${B}/${id}/annuler`)).data,
  calendar: async (params = {}) => (await api.get(`${B}/calendrier`, { params })).data,
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
  createCheckinLink: async (stayId) => (await api.post(`${B}/${stayId}/enregistrement`)).data,
  getCheckin: async (stayId) => (await api.get(`${B}/${stayId}/enregistrement`)).data,
  reviewGuest: async (guestId, data) => (await api.patch(`${B}/voyageurs/${guestId}`, data)).data,
  guestDocUrl: (docId) => `${B}/voyageurs/pieces/${docId}`,
  getContract: async (stayId) => (await api.get(`${B}/${stayId}/contrat`)).data,
  createContract: async (stayId, data = {}) => (await api.post(`${B}/${stayId}/contrat`, data)).data,
  listOpsTeams: async () => (await api.get(`${B}/equipes`)).data,
  assignTeam: async (propertyId, teamId) => (await api.put(`${B}/equipes/${propertyId}`, { team_id: teamId })).data,
  listAccess: async () => (await api.get(`${B}/acces`)).data,
  setAccess: async (propertyId, data) => (await api.put(`${B}/acces/${propertyId}`, data)).data,
  getCode: async (stayId) => (await api.get(`${B}/${stayId}/code`)).data,
  issueCode: async (stayId, data = {}) => (await api.post(`${B}/${stayId}/code`, data)).data,
  revokeCode: async (stayId) => (await api.delete(`${B}/${stayId}/code`)).data,
}

/** Côté voyageur : le lien privé tient lieu d'identification, aucun compte requis. */
const G = '/sejours/enregistrement'

export const stayCheckinService = {
  view: async (token) => (await api.get(`${G}/${token}`)).data,
  declare: async (token, data) => (await api.post(`${G}/${token}/voyageurs`, data)).data,
  uploadDoc: async (token, guestId, file) => (await api.post(
    `${G}/${token}/voyageurs/${guestId}/piece`, file,
    { params: { filename: file.name }, headers: { 'Content-Type': file.type || 'application/octet-stream' } })).data,
  submit: async (token) => (await api.post(`${G}/${token}/valider`)).data,
  signContract: async (token, signerName) => (
    await api.post(`${G}/${token}/contrat`, { signer_name: signerName })).data,
}

export const ACCESS_MODES = ['traditional', 'manual', 'ttlock']
export const TTLOCK_FIELDS = ['client_id', 'client_secret', 'access_token', 'lock_id']

export const GUEST_DOCUMENT_TYPES = ['cin', 'passeport', 'titre_sejour']
export const GUEST_STATUS_TONE = { declared: 'neutral', validated: 'good', rejected: 'crit' }

export const CONTRACT_STATUS_TONE = { draft: 'neutral', finalized: 'warn', signed: 'good' }

/** Plateformes acceptées par le service (`ical.PLATFORMS`). */
export const STAY_PLATFORMS = ['airbnb', 'booking', 'vrbo', 'autre']

export const STAY_STATUS_TONE = { confirmed: 'good', blocked: 'neutral', cancelled: 'crit' }
export const SOURCE_STATUS_TONE = { ok: 'good', pending: 'neutral', error: 'crit' }

/** Déclencheurs acceptés par le service (`messages.TRIGGERS`). */
export const STAY_TRIGGERS = ['on_booking', 'before_check_in', 'after_check_in',
  'before_check_out', 'after_check_out']
/** Les déclencheurs immédiats ignorent le délai : inutile de l'afficher. */
export const TRIGGER_HAS_OFFSET = {
  on_booking: false, before_check_in: true, after_check_in: true,
  before_check_out: true, after_check_out: true,
}

/**
 * Modèles de messages repris de StayManager, ramenés aux variables qu'un séjour porte
 * vraiment : le texte vit dans les locales (`stays.messages.presets.<clé>`), le moment
 * d'envoi ici. L'agence les installe d'un clic puis les récrit à sa main.
 *
 * Laissés de côté faute de support : les notifications ménage et maintenance (elles vont à
 * l'équipe, pas au voyageur — ce sont des tâches d'exploitation) et les messages de
 * vérification d'identité et de contrat (leur lien est un jeton à usage unique que le
 * moteur de gabarits ne sait pas fabriquer).
 */
export const STAY_TEMPLATE_PRESETS = [
  { key: 'booking_confirmation', trigger: 'on_booking', offset_hours: 0 },
  { key: 'welcome', trigger: 'on_booking', offset_hours: 0 },
  { key: 'checkin_code', trigger: 'before_check_in', offset_hours: 24 },
  { key: 'checkin_manual', trigger: 'before_check_in', offset_hours: 24 },
  { key: 'during_stay', trigger: 'after_check_in', offset_hours: 24 },
  { key: 'checkout', trigger: 'before_check_out', offset_hours: 24 },
  { key: 'review', trigger: 'after_check_out', offset_hours: 24 },
]
export const CLEANING_STATUS_TONE = { pending: 'neutral', in_progress: 'warn', done: 'good', cancelled: 'neutral' }
export const CLEANING_ZONES = ['chambres', 'salle_de_bain', 'cuisine', 'sejour', 'exterieur', 'linge']
export const CLEANING_KINDS = ['menage', 'linge', 'accueil', 'conciergerie', 'controle']
export const CLEANING_REPORT_KINDS = ['issue', 'stock', 'note']

export const MESSAGE_STATUS_TONE = { sent: 'good', pending: 'neutral', no_recipient: 'warn', failed: 'crit' }
