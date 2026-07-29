import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus, FiClipboard } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'
import { StatCard, Toolbar, Select, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'

const STATUS = {
  requested: ['Demandé', 'bg-gray-100 text-gray-700'],
  scheduled: ['Planifié', 'bg-blue-100 text-blue-700'],
  in_progress: ['En cours', 'bg-amber-100 text-amber-700'],
  done: ['Terminé', 'bg-emerald-50 text-emerald-700'],
  cancelled: ['Annulé', 'bg-red-100 text-red-700'],
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50'

function WorkOrdersList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('work-orders', () => artisanService.listWorkOrders())
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const [title, setTitle] = useState('')
  const [trade, setTrade] = useState('plombier')
  const trades = tradesData?.trades || []
  const tradeLabel = (id) => trades.find((t) => t.id === id)?.label || id

  const create = useMutation(() => artisanService.createWorkOrder({ title, trade }), {
    onSuccess: () => { toast.success('Bon de travaux créé'); setTitle(''); qc.invalidateQueries('work-orders') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const orders = data?.work_orders || []
  const stats = useMemo(() => ({
    total: orders.length,
    scheduled: orders.filter((w) => w.status === 'scheduled').length,
    in_progress: orders.filter((w) => w.status === 'in_progress').length,
    done: orders.filter((w) => w.status === 'done').length,
  }), [orders])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title="Bons de travaux" message="Le suivi des interventions est réservé aux plans Pro et Entreprise." />
  }

  const columns = [
    { header: 'Intitulé', cell: (w) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/artisans/interventions/${w.id}`}>{w.title}</Link>
    ) },
    { header: 'Métier', cell: (w) => <span className="text-gray-600">{tradeLabel(w.trade)}</span> },
    { header: 'Artisan', cell: (w) => <span className="text-gray-600">{w.artisan?.name || '—'}</span> },
    { header: 'Coût final', align: 'right', cell: (w) => <span className="font-medium text-gray-900">{w.cost_final != null ? `${w.cost_final} Đh` : '—'}</span> },
    { header: 'Statut', cell: (w) => <StatusBadge label={STATUS[w.status]?.[0] || w.status} className={STATUS[w.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} icon={FiClipboard} />
        <StatCard label="Planifiés" value={stats.scheduled} tone="blue" />
        <StatCard label="En cours" value={stats.in_progress} tone="amber" />
        <StatCard label="Terminés" value={stats.done} tone="green" />
      </div>

      <Toolbar>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Intitulé de l'intervention"
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Select value={trade} onChange={(e) => setTrade(e.target.value)}>
          {trades.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <button disabled={!title || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>
          <FiPlus className="w-5 h-5" /> Nouveau
        </button>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={orders}
        isLoading={isLoading}
        empty={<EmptyState icon={FiClipboard} title="Aucun bon de travaux" description="Créez une intervention ci-dessus, puis assignez-lui un artisan et un bien." />}
      />
    </div>
  )
}
export default WorkOrdersList
