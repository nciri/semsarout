// Module partagé (candidatures de location). Clés d'enum STABLES — les libellés
// résolvent via i18n dans le namespace `common` (partagé par public/backoffice:rental/dashboard).
export const APP_STATUS = {
  received: { labelKey: 'applicationStatus.received', className: 'bg-blue-100 text-blue-700' },
  reviewing: { labelKey: 'applicationStatus.reviewing', className: 'bg-amber-100 text-amber-700' },
  shortlist: { labelKey: 'applicationStatus.shortlist', className: 'bg-indigo-100 text-indigo-700' },
  accepted: { labelKey: 'applicationStatus.accepted', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { labelKey: 'applicationStatus.rejected', className: 'bg-red-100 text-red-700' },
  withdrawn: { labelKey: 'applicationStatus.withdrawn', className: 'bg-gray-100 text-gray-700' },
}
export const DOC_STATUS = {
  received: { labelKey: 'docStatus.received', className: 'bg-blue-100 text-blue-700' },
  validated: { labelKey: 'docStatus.validated', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { labelKey: 'docStatus.rejected', className: 'bg-red-100 text-red-700' },
}
export const DOC_TYPES = [
  ['cin', 'docTypes.cin'], ['bulletin_salaire', 'docTypes.bulletin_salaire'],
  ['contrat_travail', 'docTypes.contrat_travail'], ['avis_impot', 'docTypes.avis_impot'],
  ['garant', 'docTypes.garant'], ['autre', 'docTypes.autre'],
]
