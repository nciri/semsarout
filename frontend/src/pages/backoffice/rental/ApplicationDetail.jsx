import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiCheck, FiX, FiLock, FiStar } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, Modal, Field, PRIMARY_BTN, SECONDARY_BTN, GatedNotice } from '../../../components/backoffice/ui'
import DirIcon from '../../../components/common/DirIcon'

const STATUS_TONE = {
  received: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-amber-100 text-amber-700',
  shortlist: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-700',
}
const DOC_STATUS_TONE = {
  received: 'bg-blue-100 text-blue-700',
  validated: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

function ApplicationDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: a, isLoading, error } = useQuery(['rental-application', id], () => rentalService.getApplication(id))
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const refresh = () => qc.invalidateQueries(['rental-application', id])
  const decide = useMutation((payload) => rentalService.decideApplication(id, payload), {
    onSuccess: () => { toast.success(t('backoffice:rental.application.detail.toasts.decided')); setRejectOpen(false); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const shortlist = useMutation(() => rentalService.shortlistApplication(id), {
    onSuccess: () => { toast.success(t('backoffice:rental.application.toasts.shortlisted')); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const validateDoc = useMutation(({ docId, status }) => rentalService.validateDocument(id, docId, { status }), {
    onSuccess: () => { toast.success(t('backoffice:rental.application.detail.docs.toast')); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.application.gated.message')} />
  if (isLoading) return <div className="p-6 text-gray-500">{t('backoffice:rental.shared.loading')}</div>
  if (!a) return (
    <div className="p-6">
      <Link to="/backoffice/gestion-locative/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.shared.back')}</Link>
      <p className="mt-4 text-gray-500">{t('backoffice:rental.shared.notFound')}</p>
    </div>
  )
  const docs = a.documents || []
  const pending = ['received', 'reviewing', 'shortlist'].includes(a.status)
  const docColumns = [
    { header: t('backoffice:rental.application.detail.docs.columns.type'), cell: (d) => <span className="text-gray-700">{d.doc_type}</span> },
    { header: t('backoffice:rental.application.detail.docs.columns.file'), cell: (d) => <span className="text-gray-600">{d.filename || '—'}</span> },
    { header: t('backoffice:rental.application.detail.docs.columns.status'), cell: (d) => <StatusBadge label={t(`backoffice:rental.application.detail.docs.status.${d.status}`, { defaultValue: d.status })} className={DOC_STATUS_TONE[d.status]} /> },
    { header: '', align: 'right', cell: (d) => (
      <div className="flex gap-2 justify-end">
        <button disabled={validateDoc.isLoading} onClick={() => validateDoc.mutate({ docId: d.id, status: 'validated' })} className="text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"><FiCheck className="w-4 h-4" /> {t('backoffice:rental.application.detail.docs.validateButton')}</button>
        <button disabled={validateDoc.isLoading} onClick={() => validateDoc.mutate({ docId: d.id, status: 'rejected' })} className="text-red-600 hover:text-red-700 inline-flex items-center gap-1"><FiX className="w-4 h-4" /> {t('backoffice:rental.application.detail.docs.rejectButton')}</button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.application.detail.backToList')}</Link>
      {a.submitted_by_agent_id && <StatusBadge label={t('backoffice:rental.application.badges.submittedByAgency')} className="bg-gray-100 text-gray-600" />}
      <Panel title={t('backoffice:rental.application.detail.title', { name: a.applicant_name || `#${a.id}` })} action={pending && <div className="flex gap-2">
        {['received', 'reviewing'].includes(a.status) && (
          <button disabled={shortlist.isLoading} onClick={() => shortlist.mutate()} className={SECONDARY_BTN}><FiStar className="w-5 h-5" /> {t('backoffice:rental.application.detail.actions.shortlist')}</button>
        )}
        <button disabled={decide.isLoading} onClick={() => decide.mutate({ decision: 'accepted' })} className={PRIMARY_BTN}><FiCheck className="w-5 h-5" /> {t('backoffice:rental.application.detail.actions.accept')}</button>
        <button onClick={() => setRejectOpen(true)} className={SECONDARY_BTN}><FiX className="w-5 h-5" /> {t('backoffice:rental.application.detail.actions.reject')}</button>
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-500">{t('backoffice:rental.application.detail.fields.status')}</dt><dd className="mt-1"><StatusBadge label={t(`backoffice:rental.application.status.${a.status}`, { defaultValue: a.status })} className={STATUS_TONE[a.status]} /></dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.application.detail.fields.email')}</dt><dd className="mt-1 text-gray-900">{a.applicant_email || '—'}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.application.detail.fields.phone')}</dt><dd className="mt-1 text-gray-900">{a.applicant_phone || '—'}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.application.detail.fields.monthlyIncome')}</dt><dd className="mt-1 text-gray-900">{a.monthly_income != null ? `${a.monthly_income} Đh` : '—'}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.application.detail.fields.guarantor')}</dt><dd className="mt-1 text-gray-900">{a.guarantor_name || '—'}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.application.detail.fields.property')}</dt><dd className="mt-1 text-gray-900">{a.property_title || t('backoffice:rental.application.propertyFallback', { id: a.property_id })}</dd></div>
        </dl>
      </Panel>
      <Panel title={t('backoffice:rental.application.detail.docs.panelTitle')}>
        <DataTable columns={docColumns} rows={docs}
          empty={<EmptyState title={t('backoffice:rental.application.detail.docs.empty.title')} description={t('backoffice:rental.application.detail.docs.empty.description')} />} />
      </Panel>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title={t('backoffice:rental.application.detail.rejectModal.title')}
        footer={<>
          <button onClick={() => setRejectOpen(false)} className={SECONDARY_BTN}>{t('backoffice:rental.application.detail.rejectModal.cancel')}</button>
          <button disabled={decide.isLoading} onClick={() => decide.mutate({ decision: 'rejected', reason })} className={PRIMARY_BTN}>{t('backoffice:rental.application.detail.rejectModal.submit')}</button>
        </>}>
        <Field label={t('backoffice:rental.application.detail.rejectModal.reasonLabel')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('backoffice:rental.application.detail.rejectModal.reasonPlaceholder')} />
      </Modal>
    </div>
  )
}
export default ApplicationDetail
