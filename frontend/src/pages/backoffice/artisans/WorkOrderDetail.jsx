import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { artisanService } from '../../../services/artisanService'

function WorkOrderDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['work-order', id], () => artisanService.getWorkOrder(id))
  const { data: artisansData } = useQuery(['artisans', {}], () => artisanService.listArtisans())
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })

  const refresh = () => qc.invalidateQueries(['work-order', id])
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const save = useMutation((patch) => artisanService.updateWorkOrder(id, patch), { onSuccess: refresh, onError: onErr })

  if (isLoading) return <div className="p-8">Chargement…</div>
  if (isError || !data?.work_order) return (
    <div className="p-8 text-center text-gray-500">Bon de travaux introuvable.
      <div className="mt-3"><Link to="/backoffice/travaux" className="text-primary-600 underline">Retour</Link></div>
    </div>
  )
  const w = data.work_order
  const artisans = artisansData?.artisans || []
  const trades = tradesData?.trades || []

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{w.title}</h1>
      <p className="text-sm text-gray-500 mb-5">{trades.find((t) => t.id === w.trade)?.label || w.trade}</p>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <label className="block text-sm">Statut
          <select value={w.status} onChange={(e) => save.mutate({ status: e.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            {['requested', 'scheduled', 'in_progress', 'done', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-sm">Artisan
          <select value={w.artisan_id || ''} onChange={(e) => save.mutate({ artisan_id: e.target.value ? Number(e.target.value) : null })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            <option value="">Aucun</option>
            {artisans.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_shared ? ' (partagé)' : ''}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Coût estimé (MAD)
            <input type="number" defaultValue={w.cost_estimate ?? ''} onBlur={(e) => save.mutate({ cost_estimate: e.target.value ? Number(e.target.value) : null })}
                   className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />
          </label>
          <label className="block text-sm">Coût final (MAD)
            <input type="number" defaultValue={w.cost_final ?? ''} onBlur={(e) => save.mutate({ cost_final: e.target.value ? Number(e.target.value) : null })}
                   className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />
          </label>
        </div>
        <label className="block text-sm">Notes
          <textarea defaultValue={w.notes || ''} onBlur={(e) => save.mutate({ notes: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900" rows="3" />
        </label>
      </div>
    </div>
  )
}
export default WorkOrderDetail
