import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiCheckCircle, FiDownload, FiLock } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, GatedNotice, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import SignaturePanel from '../../../components/backoffice/SignaturePanel'
import DirIcon from '../../../components/common/DirIcon'
import useAuthStore from '../../../store/authStore'

const STATUS_TONE = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-50 text-emerald-700',
  expired: 'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
}

function MandateDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const managerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email
  const managerEmail = user?.email
  const { data: m, isLoading, error } = useQuery(['rental-mandate', id], () => rentalService.getMandate(id))
  const { data: crgData } = useQuery(['rental-crg', id], () => rentalService.listCrg(id))
  const sign = useMutation(() => rentalService.signMandate(id), {
    onSuccess: () => { toast.success(t('backoffice:rental.mandate.detail.signedToast')); qc.invalidateQueries(['rental-mandate', id]) },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  async function openPdf(url) {
    try {
      const res = await api.get(url, { responseType: 'blob' })
      window.open(URL.createObjectURL(res.data), '_blank')
    } catch { toast.error(t('backoffice:signature.pdfUnavailable')) }
  }

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.mandate.gated.message')} />
  if (isLoading) return <div className="p-6 text-gray-500">{t('backoffice:rental.shared.loading')}</div>
  if (!m) return (
    <div className="p-6">
      <Link to="/backoffice/gestion-locative" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.shared.back')}</Link>
      <p className="mt-4 text-gray-500">{t('backoffice:rental.shared.notFound')}</p>
    </div>
  )

  const crg = crgData?.reports || []
  const crgColumns = [
    { header: t('backoffice:rental.mandate.crg.period'), cell: (c) => <span className="text-gray-700">{c.period_label}</span> },
    { header: t('backoffice:rental.mandate.crg.collected'), align: 'right', cell: (c) => <span className="text-gray-700">{c.rent_collected} Đh</span> },
    { header: t('backoffice:rental.mandate.crg.net'), align: 'right', cell: (c) => <span className="font-medium text-gray-900">{c.net} Đh</span> },
    { header: '', align: 'right', cell: (c) => <button onClick={() => openPdf(rentalService.crgPdfUrl(id, c.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /> {t('backoffice:rental.mandate.crg.pdf')}</button> },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.mandate.backToList')}</Link>
      <Panel title={t('backoffice:rental.mandate.detail.title', { reference: m.reference })} action={<div className="flex gap-2">
        <button onClick={() => openPdf(rentalService.mandatePdfUrl(id))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> {t('backoffice:rental.mandate.detail.pdfButton')}</button>
        {m.status === 'draft' && <button disabled={sign.isLoading} onClick={() => sign.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> {t('backoffice:rental.mandate.detail.signButton')}</button>}
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.status')}</dt><dd className="mt-1"><StatusBadge label={t(`backoffice:rental.mandate.status.${m.status}`, { defaultValue: m.status })} className={STATUS_TONE[m.status]} /></dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.type')}</dt><dd className="mt-1 text-gray-900">{t(`backoffice:rental.mandate.type.${m.mandate_type}`, { defaultValue: m.mandate_type })}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.fees')}</dt><dd className="mt-1 text-gray-900">{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.propertyId')}</dt><dd className="mt-1 text-gray-900">{m.property_id}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.landlordId')}</dt><dd className="mt-1 text-gray-900">{m.landlord_client_id}</dd></div>
        </dl>
      </Panel>
      <Panel title={t('backoffice:rental.mandate.crg.panelTitle')}>
        <DataTable columns={crgColumns} rows={crg}
          empty={<EmptyState title={t('backoffice:rental.mandate.crg.empty.title')} description={t('backoffice:rental.mandate.crg.empty.description')} />} />
      </Panel>
      <SignaturePanel docType="mandate" docId={id} managerName={managerName} managerEmail={managerEmail} />
    </div>
  )
}
export default MandateDetail
