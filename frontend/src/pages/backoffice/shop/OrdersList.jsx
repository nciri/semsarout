import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { shopService } from '../../../services/shopService'

const STATUS = { pending: ['En attente', 'bg-gray-100 text-gray-700'], paid: ['Payée', 'bg-blue-100 text-blue-700'],
  preparing: ['Préparation', 'bg-amber-100 text-amber-700'], shipped: ['Expédiée', 'bg-indigo-100 text-indigo-700'],
  delivered: ['Livrée', 'bg-green-100 text-green-700'], cancelled: ['Annulée', 'bg-red-100 text-red-700'] }

function OrdersList() {
  const { data, isLoading } = useQuery('shop-orders', () => shopService.listOrders())
  if (isLoading) return <div className="p-8">Chargement…</div>
  const orders = data?.orders || []
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Mes commandes</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <th className="px-4 py-3">Référence</th><th>Articles</th><th>Total</th><th>Statut</th><th>Date</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><Link className="text-primary-600 font-medium" to={`/backoffice/mes-commandes/${o.id}`}>{o.reference}</Link></td>
                <td>{o.items_count}</td><td>{o.total} MAD</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${STATUS[o.status]?.[1]}`}>{STATUS[o.status]?.[0] || o.status}</span></td>
                <td>{o.created_at ? new Date(o.created_at).toLocaleDateString('fr-FR') : ''}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucune commande.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default OrdersList
