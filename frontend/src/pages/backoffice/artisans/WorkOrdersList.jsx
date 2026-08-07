import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLock, FiPlus, FiClipboard } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'
import { StatCard, Toolbar, Select, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'

const STATUS_TONE = {
  requested: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50'

function WorkOrdersList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('work-orders', () => artisanService.listWorkOrders())
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const [title, setTitle] = useState('')
  const [trade, setTrade] = useState('plombier')
  const trades = tradesData?.trades || []
  const tradeLabel = (id) => trades.find((tr) => tr.id === id)?.label || id

  const create = useMutation(() => artisanService.createWorkOrder({ title, trade }), {
    onSuccess: () => { toast.success(t('backoffice:artisans.workOrder.toasts.created')); setTitle(''); qc.invalidateQueries('work-orders') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const orders = data?.work_orders || []
  const stats = useMemo(() => ({
    total: orders.length,
    scheduled: orders.filter((w) => w.status === 'scheduled').length,
    in_progress: orders.filter((w) => w.status === 'in_progress').length,
    done: orders.filter((w) => w.status === 'done').length,
  }), [orders])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title={t('backoffice:artisans.workOrder.gated.title')} message={t('backoffice:artisans.workOrder.gated.message')} />
  }

  const columns = [
    { header: t('backoffice:artisans.workOrder.columns.title'), cell: (w) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/artisans/interventions/${w.id}`}>{w.title}</Link>
    ) },
    { header: t('backoffice:artisans.workOrder.columns.trade'), cell: (w) => <span className="text-gray-600">{tradeLabel(w.trade)}</span> },
    { header: t('backoffice:artisans.workOrder.columns.artisan'), cell: (w) => <span className="text-gray-600">{w.artisan?.name || '—'}</span> },
    { header: t('backoffice:artisans.workOrder.columns.costFinal'), align: 'right', cell: (w) => <span className="font-medium text-gray-900">{w.cost_final != null ? `${w.cost_final} Đh` : '—'}</span> },
    { header: t('backoffice:artisans.workOrder.columns.status'), cell: (w) => <StatusBadge label={t(`backoffice:artisans.workOrder.status.${w.status}`, { defaultValue: w.status })} className={STATUS_TONE[w.status]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('backoffice:artisans.workOrder.stats.total')} value={stats.total} icon={FiClipboard} />
        <StatCard label={t('backoffice:artisans.workOrder.stats.scheduled')} value={stats.scheduled} tone="blue" />
        <StatCard label={t('backoffice:artisans.workOrder.stats.inProgress')} value={stats.in_progress} tone="amber" />
        <StatCard label={t('backoffice:artisans.workOrder.stats.done')} value={stats.done} tone="green" />
      </div>

      <Toolbar>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('backoffice:artisans.workOrder.form.titlePlaceholder')}
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Select value={trade} onChange={(e) => setTrade(e.target.value)}>
          {trades.map((tr) => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
        </Select>
        <button disabled={!title || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>
          <FiPlus className="w-5 h-5" /> {t('backoffice:artisans.workOrder.form.newButton')}
        </button>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={orders}
        isLoading={isLoading}
        empty={<EmptyState icon={FiClipboard} title={t('backoffice:artisans.workOrder.empty.title')} description={t('backoffice:artisans.workOrder.empty.description')} />}
      />
    </div>
  )
}
export default WorkOrdersList
