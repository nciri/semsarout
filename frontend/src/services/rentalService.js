import api from './api'

const B = '/backoffice/gestion-locative'

export const rentalService = {
  // Mandats
  listMandates: async () => (await api.get(`${B}/mandates`)).data,
  getMandate: async (id) => (await api.get(`${B}/mandates/${id}`)).data,
  createMandate: async (data) => (await api.post(`${B}/mandates`, data)).data,
  signMandate: async (id) => (await api.post(`${B}/mandates/${id}/sign`)).data,
  listCrg: async (mandateId) => (await api.get(`${B}/mandates/${mandateId}/crg`)).data,
  crgPdfUrl: (mandateId, crgId) => `/api/v1${B}/mandates/${mandateId}/crg/${crgId}.pdf`,
  // Baux
  listLeases: async () => (await api.get(`${B}/leases`)).data,
  getLease: async (id) => (await api.get(`${B}/leases/${id}`)).data,
  createLease: async (data) => (await api.post(`${B}/leases`, data)).data,
  signLease: async (id) => (await api.post(`${B}/leases/${id}/sign`)).data,
  reviseLease: async (id, data) => (await api.post(`${B}/leases/${id}/revise`, data)).data,
  returnDeposit: async (id, data) => (await api.post(`${B}/leases/${id}/deposit-return`, data)).data,
  // Quittancement
  listRentPeriods: async (leaseId) => (await api.get(`${B}/leases/${leaseId}/rent-periods`)).data,
  payRentPeriod: async (id, data) => (await api.post(`${B}/rent-periods/${id}/pay`, data)).data,
  receiptPdfUrl: (id) => `/api/v1${B}/rent-periods/${id}/receipt.pdf`,
  // Candidatures
  listApplications: async () => (await api.get(`${B}/applications`)).data,
  getApplication: async (id) => (await api.get(`${B}/applications/${id}`)).data,
  decideApplication: async (id, data) => (await api.post(`${B}/applications/${id}/decide`, data)).data,
  validateDocument: async (appId, docId, data) => (await api.patch(`${B}/applications/${appId}/documents/${docId}`, data)).data,
}
