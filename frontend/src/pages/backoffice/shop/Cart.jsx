import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiTrash2 } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import api from '../../../services/api'

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

  if (isLoading) return <div className="p-8">Chargement…</div>
  const cart = data?.cart || { items: [], total: 0 }
  const properties = propsData?.properties || []
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Mon panier</h1>
      {cart.items.length === 0 ? <p className="text-gray-400">Votre panier est vide.</p> : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-5">
            {cart.items.map((it) => (
              <div key={it.id} className="flex items-center gap-4 p-3">
                <div className="flex-1"><div className="font-medium text-gray-900">{it.product?.name || '—'}</div><div className="text-sm text-gray-500">{it.product?.price} MAD</div></div>
                <input type="number" min="1" value={it.quantity} onChange={(e) => upd.mutate({ id: it.id, quantity: Math.max(1, Number(e.target.value)) })} className="w-16 border border-gray-300 rounded px-2 py-1 text-gray-900" />
                <div className="w-24 text-right font-medium">{it.line_total} MAD</div>
                <button onClick={() => rm.mutate(it.id)} className="text-red-600"><FiTrash2 /></button>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{cart.total} MAD</span></div>
            <label className="block text-sm">Livrer vers un bien (optionnel)
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
                <option value="">— Adresse libre —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.title || p.reference}</option>)}
              </select>
            </label>
            {!propertyId && <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse de livraison" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />}
            <button onClick={() => order.mutate()} className="btn-primary w-full">Commander</button>
          </div>
        </>
      )}
    </div>
  )
}
export default Cart
