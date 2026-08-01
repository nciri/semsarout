import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiArrowLeft } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'

const STATUS_OPTIONS = [
  ['requested', 'Demandé'], ['scheduled', 'Planifié'], ['in_progress', 'En cours'],
  ['done', 'Terminé'], ['cancelled', 'Annulé'],
]

function WorkOrderDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['work-order', id], () => artisanService.getWorkOrder(id))
  const { data: artisansData } = useQuery(['artisans', {}], () => artisanService.listArtisans())
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })

  const refresh = () => qc.invalidateQueries(['work-order', id])
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const save = useMutation((patch) => artisanService.updateWorkOrder(id, patch), {
    onSuccess: () => { toast.success('Enregistré'); refresh() },
    onError: onErr,
  })

  if (isLoading) return <div className="max-w-2xl animate-pulse space-y-4"><div className="h-4 w-24 bg-gray-200 rounded" /><div className="h-64 bg-gray-100 rounded-xl" /></div>
  if (isError || !data?.work_order) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
        Bon de travaux introuvable. <Link to="/backoffice/artisans/interventions" className="text-primary-600 hover:underline">Retour</Link>
      </div>
    )
  }
  const w = data.work_order
  const artisans = artisansData?.artisans || []
  const trades = tradesData?.trades || []
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-4 max-w-2xl">
      <Link to="/backoffice/artisans/interventions" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Interventions
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h1 className="text-2xl font-bold text-gray-900">{w.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{trades.find((t) => t.id === w.trade)?.label || w.trade}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div>
          <label className={labelCls}>Statut</label>
          <select value={w.status} onChange={(e) => save.mutate({ status: e.target.value })} className={ctrlCls}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Artisan</label>
          <select value={w.artisan_id || ''} onChange={(e) => save.mutate({ artisan_id: e.target.value ? Number(e.target.value) : null })} className={ctrlCls}>
            <option value="">Aucun</option>
            {artisans.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_shared ? ' (partagé)' : ''}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Coût estimé (Đh)</label>
            <input type="number" defaultValue={w.cost_estimate ?? ''} onBlur={(e) => save.mutate({ cost_estimate: e.target.value ? Number(e.target.value) : null })} className={ctrlCls} />
          </div>
          <div>
            <label className={labelCls}>Coût final (Đh)</label>
            <input type="number" defaultValue={w.cost_final ?? ''} onBlur={(e) => save.mutate({ cost_final: e.target.value ? Number(e.target.value) : null })} className={ctrlCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea defaultValue={w.notes || ''} onBlur={(e) => save.mutate({ notes: e.target.value })} rows="3" className={ctrlCls} />
        </div>
        <p className="text-xs text-gray-400">Les modifications sont enregistrées automatiquement.</p>
      </div>
    </div>
  )
}
export default WorkOrderDetail
