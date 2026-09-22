import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiCheckCircle, FiDownload, FiExternalLink, FiLock } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, DataTable, EmptyState, GatedNotice } from '../../../components/backoffice/ui'
import SignaturePanel from '../../../components/backoffice/SignaturePanel'
import DirIcon from '../../../components/common/DirIcon'
import useAuthStore from '../../../store/authStore'
import { Chip, IconAction } from '../components/kit'
import { MANDATE_TONE } from './model'
import { useRentalFormat } from './hooks'

function MandateDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const f = useRentalFormat()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const managerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email
  const managerEmail = user?.email
  const { data: m, isLoading, error } = useQuery(['rental-mandate', id], () => rentalService.getMandate(id))
  const { data: crgData } = useQuery(['rental-crg', id], () => rentalService.listCrg(id))
  const sign = useMutation(() => rentalService.signMandate(id), {
    onSuccess: () => { toast.success(t('backoffice:rental.mandate.detail.signedToast')); qc.invalidateQueries(['rental-mandate', id]); qc.invalidateQueries('rental-summary') },
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
    { header: t('backoffice:rental.mandate.crg.collected'), align: 'right', cell: (c) => <span className="text-gray-700 tabular-nums">{f.dh(c.rent_collected)}</span> },
    { header: t('backoffice:rental.mandate.crg.net'), align: 'right', cell: (c) => <span className="font-medium text-gray-900 tabular-nums">{f.dh(c.net)}</span> },
    { header: '', align: 'right', cell: (c) => <IconAction icon={FiDownload} label={t('backoffice:rental.overview.crgPdf', { period: c.period_label })} onClick={() => openPdf(rentalService.crgPdfUrl(id, c.id))} tone="gold" tipAlign="end" /> },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.mandate.backToList')}</Link>
      <Panel title={t('backoffice:rental.mandate.detail.title', { reference: m.reference })} action={<div className="flex gap-1">
        <IconAction icon={FiDownload} label={t('backoffice:rental.overview.mandatePdf')} onClick={() => openPdf(rentalService.mandatePdfUrl(id))} className="border border-gray-200" />
        {m.status === 'draft' && <IconAction icon={FiCheckCircle} label={t('backoffice:rental.mandate.detail.signButton')} tone="primary" tipAlign="end" disabled={sign.isLoading} onClick={() => sign.mutate()} />}
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.status')}</dt><dd className="mt-1"><Chip tone={MANDATE_TONE[m.status] || 'neutral'}>{t(`backoffice:rental.mandate.status.${m.status}`, { defaultValue: m.status })}</Chip></dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.type')}</dt><dd className="mt-1 text-gray-900">{t(`backoffice:rental.mandate.type.${m.mandate_type}`, { defaultValue: m.mandate_type })}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.mandate.detail.fields.fees')}</dt><dd className="mt-1 text-gray-900">{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.overview.mandates.property')}</dt><dd className="mt-1 text-gray-900">{m.property_title ? [m.property_title, m.property_city].filter(Boolean).join(', ') : t('backoffice:rental.application.propertyFallback', { id: m.property_id })}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.overview.mandates.landlord')}</dt><dd className="mt-1 text-gray-900">{m.landlord_name || `#${m.landlord_client_id}`}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.overview.mandates.end')}</dt><dd className="mt-1 text-gray-900">{m.end_date ? f.date(m.end_date) : '—'}</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.overview.mandates.leased')}</dt><dd className="mt-1 text-gray-900">
            {m.active_lease_id
              ? <span className="inline-flex items-center gap-1">{t('backoffice:rental.overview.mandates.yes')}<IconAction icon={FiExternalLink} label={t('backoffice:rental.overview.openLease')} to={`/backoffice/gestion-locative/baux/${m.active_lease_id}`} tone="gold" className="-my-2" /></span>
              : m.status === 'active' ? <Chip tone="warn">{t('backoffice:rental.overview.mandates.vacant')}</Chip> : '—'}
          </dd></div>
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
