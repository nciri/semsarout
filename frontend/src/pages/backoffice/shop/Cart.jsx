import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiTrash2, FiArrowLeft, FiShoppingCart } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import api from '../../../services/api'
import { PageHeader, EmptyState } from '../../../components/backoffice/ui'

function Cart() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery('shop-cart', () => shopService.getCart())
  const { data: propsData } = useQuery('bo-properties-shop', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const [propertyId, setPropertyId] = useState('')
  const [address, setAddress] = useState('')

  const refresh = () => qc.invalidateQueries('shop-cart')
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const upd = useMutation(({ id, quantity }) => shopService.updateCartItem(id, quantity), { onSuccess: refresh, onError: onErr })
  const rm = useMutation((id) => shopService.removeCartItem(id), { onSuccess: refresh, onError: onErr })
  const order = useMutation(() => shopService.checkout({ property_id: propertyId ? Number(propertyId) : undefined, delivery_address: address || undefined }), {
    onSuccess: (res) => { toast.success('Commande créée'); qc.invalidateQueries('shop-cart'); navigate(`/backoffice/mes-commandes/${res.order.id}`) },
    onError: onErr,
  })

  const cart = data?.cart || { items: [], total: 0 }
  const properties = propsData?.properties || []

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link to="/backoffice/boutique" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <FiArrowLeft className="w-4 h-4" /> Continuer mes achats
        </Link>
        <PageHeader title="Mon panier" />
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
        </div>
      ) : cart.items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <EmptyState
            icon={FiShoppingCart}
            title="Votre panier est vide"
            description="Parcourez la boutique pour ajouter du mobilier et de l'électroménager."
            action={<Link to="/backoffice/boutique" className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">Aller à la boutique</Link>}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {cart.items.map((it) => (
              <div key={it.id} className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {it.product?.image_url
                    ? <img src={it.product.image_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-xl text-gray-300">🛋️</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{it.product?.name || '—'}</div>
                  <div className="text-sm text-gray-500">{it.product?.price} Đh</div>
                </div>
                <input
                  type="number" min="1"
                  value={it.quantity}
                  onChange={(e) => upd.mutate({ id: it.id, quantity: Math.max(1, Number(e.target.value)) })}
                  className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="w-24 text-right font-medium text-gray-900">{it.line_total} Đh</div>
                <button onClick={() => rm.mutate(it.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Retirer">
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="flex justify-between items-center font-bold text-lg text-gray-900">
              <span>Total</span><span>{cart.total} Đh</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Livrer vers un bien (optionnel)</label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— Adresse libre —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.title || p.reference}</option>)}
              </select>
            </div>
            {!propertyId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse de livraison</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Adresse de livraison"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}
            <button
              onClick={() => order.mutate()}
              disabled={order.isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              Commander
            </button>
          </div>
        </>
      )}
    </div>
  )
}
export default Cart
