import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiMapPin } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import { StatusBadge } from '../../../components/backoffice/ui'

const STATUS = {
  pending: ['En attente', 'bg-gray-100 text-gray-700'],
  paid: ['Payée', 'bg-blue-100 text-blue-700'],
  preparing: ['Préparation', 'bg-amber-100 text-amber-700'],
  shipped: ['Expédiée', 'bg-indigo-100 text-indigo-700'],
  delivered: ['Livrée', 'bg-emerald-50 text-emerald-700'],
  cancelled: ['Annulée', 'bg-red-100 text-red-700'],
}

function OrderDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['shop-order', id], () => shopService.getOrder(id))
  const pay = useMutation(() => shopService.payOrder(id), {
    onSuccess: () => { toast.success('Paiement effectué'); qc.invalidateQueries(['shop-order', id]) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (isLoading) return <div className="max-w-2xl animate-pulse space-y-4"><div className="h-4 w-24 bg-gray-200 rounded" /><div className="h-40 bg-gray-100 rounded-xl" /></div>
  if (isError || !data?.order) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
        Commande introuvable. <Link to="/backoffice/mes-commandes" className="text-primary-600 hover:underline">Retour</Link>
      </div>
    )
  }
  const o = data.order

  return (
    <div className="space-y-4 max-w-2xl">
      <Link to="/backoffice/mes-commandes" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Mes commandes
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{o.reference}</h1>
          <StatusBadge label={STATUS[o.status]?.[0] || o.status} className={STATUS[o.status]?.[1]} />
        </div>
        {o.delivery_address && (
          <p className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <FiMapPin className="w-4 h-4 text-gray-400" /> {o.delivery_address}
          </p>
        )}
        <div className="divide-y divide-gray-100 border-y border-gray-100">
          {(o.items || []).map((it) => (
            <div key={it.id} className="flex justify-between items-center py-3 text-sm">
              <span className="text-gray-700">{it.product_name} <span className="text-gray-400">× {it.quantity}</span></span>
              <span className="font-medium text-gray-900">{it.line_total} Đh</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center font-bold text-lg text-gray-900 pt-4">
          <span>Total</span><span>{o.total} Đh</span>
        </div>
        {o.status === 'pending' && (
          <button
            onClick={() => pay.mutate()}
            disabled={pay.isLoading}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            Payer maintenant
          </button>
        )}
        {o.payment_reference && <p className="text-xs text-gray-400 mt-3">Réf. paiement : {o.payment_reference}</p>}
      </div>
    </div>
  )
}
export default OrderDetail
