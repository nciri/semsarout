import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft } from 'react-icons/fi'
import api from '../../../services/api'
import { artisanService } from '../../../services/artisanService'
import { rentalService } from '../../../services/rentalService'
import { useRentalFormat } from '../rental/hooks'
import { Kv } from '../components/kit'
import DirIcon from '../../../components/common/DirIcon'

const STATUS_ENUMS = ['requested', 'scheduled', 'in_progress', 'done', 'cancelled']

function WorkOrderDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['work-order', id], () => artisanService.getWorkOrder(id))
  const { data: artisansData } = useQuery(['artisans', {}], () => artisanService.listArtisans())
  const f = useRentalFormat()
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })

  const { data: clientsData } = useQuery('bo-clients-min',
    async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const { data: mandatesData, isLoading: mandatesLoading } = useQuery('rental-mandates', () => rentalService.listMandates(), { retry: false })

  const refresh = () => qc.invalidateQueries(['work-order', id])
  const onErr = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))
  const save = useMutation((patch) => artisanService.updateWorkOrder(id, patch), {
    onSuccess: () => { toast.success(t('backoffice:artisans.workOrder.toasts.saved')); refresh() },
    onError: onErr,
  })

  if (isLoading) return <div className="max-w-2xl animate-pulse space-y-4"><div className="h-4 w-24 bg-gray-200 rounded" /><div className="h-64 bg-gray-100 rounded-xl" /></div>
  if (isError || !data?.work_order) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
        {t('backoffice:artisans.workOrder.notFound')} <Link to="/backoffice/tiers/artisans" className="text-primary-600 hover:underline">{t('backoffice:artisans.shared.back')}</Link>
      </div>
    )
  }
  const w = data.work_order
  const artisans = artisansData?.artisans || []
  const trades = tradesData?.trades || []
  // crg:<id> se lit depuis le mandat du bien, que le bon ne porte pas ; settlement:<id> identifie
  // le décompte, qui se rouvre par le bail.
  const client = (clientsData?.clients || []).find((c) => c.id === w.client_id)
  const mandates = (mandatesData?.mandates || []).filter((m) => m.property_id === w.property_id)
  // Un seul mandat pour le bien, sinon on ne sait pas lequel porte ce compte rendu : pas de lien.
  const mandate = mandates.length === 1 ? mandates[0] : null
  const [refKind, refId] = (w.charged_ref || '').split(':')
  const landing = {
    crg: mandate && { to: `/backoffice/gestion-locative/mandats/${mandate.id}`, label: t('backoffice:artisans.workOrder.payment.landedCrg', { id: refId }) },
    settlement: w.lease_id && { to: `/backoffice/gestion-locative/decompte/${w.lease_id}`, label: t('backoffice:artisans.workOrder.payment.landedSettlement') },
  }[refKind]
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-4 max-w-2xl">
      <Link to="/backoffice/tiers/artisans" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:artisans.workOrder.backToList')}
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h1 className="text-2xl font-bold text-gray-900">{w.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{trades.find((tr) => tr.id === w.trade)?.label || w.trade}</p>
      </div>

      {w.payer && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('backoffice:artisans.workOrder.payment.title')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <Kv label={t('backoffice:artisans.workOrder.payment.client')} value={client ? `${client.first_name} ${client.last_name}` : '—'} />
            <Kv label={t('backoffice:artisans.workOrder.payment.payer')} value={t(`backoffice:artisans.workOrder.payer.${w.payer}`)}
              sub={w.payer === 'third_party' ? w.third_party_label : undefined} />
            <Kv label={t('backoffice:artisans.workOrder.payment.mode')} value={t(`backoffice:artisans.workOrder.chargeMode.${w.charge_mode}`)} />
            {w.cost_final != null && <Kv label={t('backoffice:artisans.workOrder.payment.amount')} value={f.dh(w.cost_final)} />}
          </div>
          <p className="mt-4 text-sm text-gray-600">
            {landing
              ? <Link to={landing.to} className="font-medium text-primary-600 hover:underline">{landing.label}</Link>
              : (refKind === 'crg'
                // Tant que les mandats chargent, on ne sait pas encore s'il y a un lien : rien plutôt qu'un faux « introuvable ».
                ? !mandatesLoading && t('backoffice:artisans.workOrder.payment.landedCrgUnlinked', { id: refId })
                : t(w.charged_ref ? 'backoffice:artisans.workOrder.payment.landedElsewhere' : 'backoffice:artisans.workOrder.payment.notCharged'))}
          </p>
        </section>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div>
          <label className={labelCls}>{t('backoffice:artisans.workOrder.fields.status')}</label>
          <select value={w.status} onChange={(e) => save.mutate({ status: e.target.value })} className={ctrlCls}>
            {STATUS_ENUMS.map((v) => <option key={v} value={v}>{t(`backoffice:artisans.workOrder.status.${v}`, { defaultValue: v })}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('backoffice:artisans.workOrder.fields.artisan')}</label>
          <select value={w.artisan_id || ''} onChange={(e) => save.mutate({ artisan_id: e.target.value ? Number(e.target.value) : null })} className={ctrlCls}>
            <option value="">{t('backoffice:artisans.workOrder.fields.noneOption')}</option>
            {artisans.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_shared ? t('backoffice:artisans.workOrder.fields.sharedSuffix') : ''}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('backoffice:artisans.workOrder.fields.costEstimate')}</label>
            <input type="number" defaultValue={w.cost_estimate ?? ''} onBlur={(e) => save.mutate({ cost_estimate: e.target.value ? Number(e.target.value) : null })} className={ctrlCls} />
          </div>
          <div>
            <label className={labelCls}>{t('backoffice:artisans.workOrder.fields.costFinal')}</label>
            <input type="number" defaultValue={w.cost_final ?? ''} onBlur={(e) => save.mutate({ cost_final: e.target.value ? Number(e.target.value) : null })} className={ctrlCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('backoffice:artisans.workOrder.fields.notes')}</label>
          <textarea defaultValue={w.notes || ''} onBlur={(e) => save.mutate({ notes: e.target.value })} rows="3" className={ctrlCls} />
        </div>
        <p className="text-xs text-gray-400">{t('backoffice:artisans.workOrder.autoSaveNote')}</p>
      </div>
    </div>
  )
}
export default WorkOrderDetail
