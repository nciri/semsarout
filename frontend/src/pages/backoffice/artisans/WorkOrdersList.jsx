import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'

const STATUS = { requested: ['Demandé', 'bg-gray-100 text-gray-700'], scheduled: ['Planifié', 'bg-blue-100 text-blue-700'],
  in_progress: ['En cours', 'bg-amber-100 text-amber-700'], done: ['Terminé', 'bg-green-100 text-green-700'], cancelled: ['Annulé', 'bg-red-100 text-red-700'] }

function WorkOrdersList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('work-orders', () => artisanService.listWorkOrders())
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const [title, setTitle] = useState('')
  const [trade, setTrade] = useState('plombier')
  const gated = error?.response?.status === 403
  const trades = tradesData?.trades || []

  const create = useMutation(() => artisanService.createWorkOrder({ title, trade }), {
    onSuccess: () => { toast.success('Bon de travaux créé'); setTitle(''); qc.invalidateQueries('work-orders') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Travaux</h1>
        <p className="text-gray-500 mt-2">Réservé aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Chargement…</div>
  const orders = data?.work_orders || []
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Bons de travaux</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-2 items-center">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intitulé de l'intervention"
               className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 min-w-[200px]" />
        <select value={trade} onChange={(e) => setTrade(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          {trades.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <button disabled={!title} onClick={() => create.mutate()} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"><FiPlus /> Nouveau</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <th className="px-4 py-3">Intitulé</th><th>Métier</th><th>Artisan</th><th>Coût final</th><th>Statut</th></tr></thead>
          <tbody>
            {orders.map((w) => (
              <tr key={w.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><Link className="text-primary-600 font-medium" to={`/backoffice/travaux/${w.id}`}>{w.title}</Link></td>
                <td>{trades.find((t) => t.id === w.trade)?.label || w.trade}</td>
                <td>{w.artisan?.name || '—'}</td>
                <td>{w.cost_final != null ? `${w.cost_final} MAD` : '—'}</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${STATUS[w.status]?.[1]}`}>{STATUS[w.status]?.[0] || w.status}</span></td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun bon de travaux.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default WorkOrdersList
