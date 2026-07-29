import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { shopService } from '../../services/shopService'

const STATUSES = ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled']

function AdminOrders() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('admin-orders', () => shopService.adminListOrders())
  const upd = useMutation(({ id, status }) => shopService.adminUpdateOrder(id, status), {
    onSuccess: () => { toast.success('Statut mis à jour'); qc.invalidateQueries('admin-orders') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading) return <div>Chargement…</div>
  const orders = data?.orders || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Commandes</h1>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3">Référence</th><th>Agence</th><th>Total</th><th>Statut</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{o.reference}</td><td>{o.agency_id}</td><td>{o.total} Đh</td>
                <td>
                  <select value={o.status} onChange={(e) => upd.mutate({ id: o.id, status: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-slate-900">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">Aucune commande.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default AdminOrders
