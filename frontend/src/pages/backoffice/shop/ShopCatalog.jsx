import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiShoppingCart } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'

function ShopCatalog() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState({ group: '', category: '', q: '' })
  const { data: catData } = useQuery('shop-categories', () => shopService.categories(), { staleTime: 3600000 })
  const { data, isLoading } = useQuery(['shop-products', filter], () => shopService.products(filter), { keepPreviousData: true })
  const { data: cartData } = useQuery('shop-cart', () => shopService.getCart())
  const cats = catData?.categories || []
  const cartCount = (cartData?.cart?.items || []).reduce((s, i) => s + i.quantity, 0)

  const add = useMutation((id) => shopService.addToCart(id, 1), {
    onSuccess: () => { toast.success('Ajouté au panier'); qc.invalidateQueries('shop-cart') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const products = data?.products || []
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Boutique</h1>
        <Link to="/backoffice/panier" className="relative btn-secondary inline-flex items-center gap-2">
          <FiShoppingCart /> Panier
          {cartCount > 0 && <span className="absolute -top-2 -right-2 bg-primary-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{cartCount}</span>}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        <select value={filter.group} onChange={(e) => setFilter({ ...filter, group: e.target.value, category: '' })} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="">Tous groupes</option><option value="furniture">Meubles</option><option value="appliance">Électroménager</option>
        </select>
        <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="">Toutes catégories</option>
          {cats.filter((c) => !filter.group || c.group === filter.group).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Rechercher…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 min-w-[160px]" />
      </div>
      {isLoading ? <p>Chargement…</p> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
              <Link to={`/backoffice/boutique/${p.id}`} className="block h-36 bg-gray-100">
                {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">🛋️</div>}
              </Link>
              <div className="p-3 flex-1 flex flex-col">
                <Link to={`/backoffice/boutique/${p.id}`} className="font-medium text-gray-900 text-sm line-clamp-2">{p.name}</Link>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="font-bold text-gray-900">{p.price} MAD</span>
                  <button onClick={() => add.mutate(p.id)} disabled={p.stock < 1} className="btn-primary text-xs disabled:opacity-40">{p.stock < 1 ? 'Rupture' : 'Ajouter'}</button>
                </div>
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="col-span-full text-center text-gray-400 py-8">Aucun produit.</p>}
        </div>
      )}
    </div>
  )
}
export default ShopCatalog
