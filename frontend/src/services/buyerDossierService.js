import api from './api'

// Dossier d'achat : les mêmes pièces vues des deux côtés — l'acquéreur les dépose sur son
// espace, l'agence les relit sur la fiche client. Le fichier part en corps brut (cf. rental).
const upload = (url) => async (file, docType) => (await api.post(url, file, {
  params: { doc_type: docType, filename: file.name },
  headers: { 'Content-Type': file.type || 'application/octet-stream' },
})).data

export const buyerDossierService = {
  // Côté acquéreur
  myDossiers: async () => (await api.get('/buyer-dossier')).data,
  uploadMyDocument: (clientId, file, docType) => upload(`/buyer-dossier/${clientId}/documents`)(file, docType),
  deleteMyDocument: async (clientId, docId) => (await api.delete(`/buyer-dossier/${clientId}/documents/${docId}`)).data,
  myDocumentUrl: (clientId, docId) => `/buyer-dossier/${clientId}/documents/${docId}`,

  // Côté agence
  documents: async (clientId) => (await api.get(`/backoffice/clients/${clientId}/documents`)).data,
  uploadDocument: (clientId, file, docType) => upload(`/backoffice/clients/${clientId}/documents`)(file, docType),
  setDocumentStatus: async (clientId, docId, status) => (await api.patch(`/backoffice/clients/${clientId}/documents/${docId}`, { status })).data,
  documentUrl: (clientId, docId) => `/backoffice/clients/${clientId}/documents/${docId}`,
  saveFinancing: async (clientId, data) => (await api.put(`/backoffice/clients/${clientId}`, data)).data,
}

/** Clés d'enum stables des pièces d'un dossier d'achat — libellés via i18n. */
export const BUYER_DOC_TYPES = ['cin', 'justificatif_revenu', 'releve_bancaire', 'accord_bancaire', 'autre']
export const BUYER_DOC_TONE = { received: 'neutral', validated: 'good', rejected: 'crit' }
export const FINANCING_TONE = { financed: 'good', tight: 'warn', gap: 'crit', no_target: 'neutral', unknown: 'neutral' }
