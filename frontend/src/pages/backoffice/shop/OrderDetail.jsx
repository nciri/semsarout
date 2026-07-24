import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { shopService } from '../../../services/shopService'

const STATUS = { pending: 'En attente', paid: 'Payée', preparing: 'Préparation', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' }

function OrderDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['shop-order', id], () => shopService.getOrder(id))
  const pay = useMutation(() => shopService.payOrder(id), {
    onSuccess: () => { toast.success('Paiement effectué'); qc.invalidateQueries(['shop-order', id]) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading) return <div className="p-8">Chargement…</div>
  if (isError || !data?.order) return <div className="p-8 text-center text-gray-500">Commande introuvable. <Link to="/backoffice/mes-commandes" className="text-primary-600 underline">Retour</Link></div>
  const o = data.order
  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{o.reference}</h1>
        <span className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-700">{STATUS[o.status] || o.status}</span>
      </div>
      {o.delivery_address && <p className="text-sm text-gray-500 mb-4">Livraison : {o.delivery_address}</p>}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-4">
        {(o.items || []).map((it) => (
          <div key={it.id} className="flex justify-between p-3 text-sm">
            <span>{it.product_name} × {it.quantity}</span><span className="font-medium">{it.line_total} MAD</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-bold text-lg mb-4"><span>Total</span><span>{o.total} MAD</span></div>
      {o.status === 'pending' && <button onClick={() => pay.mutate()} className="btn-primary w-full">Payer maintenant</button>}
      {o.payment_reference && <p className="text-xs text-gray-400 mt-3">Réf. paiement : {o.payment_reference}</p>}
    </div>
  )
}
export default OrderDetail
