import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiShoppingCart, FiPlus, FiShoppingBag } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import { PageHeader, Toolbar, Select, SearchInput, EmptyState } from '../../../components/backoffice/ui'

function ProductSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-40 bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  )
}

function ShopCatalog() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState({ group: '', category: '', q: '' })
  const { data: catData } = useQuery('shop-categories', () => shopService.categories(), { staleTime: 3600000 })
  const { data, isLoading } = useQuery(['shop-products', filter], () => shopService.products(filter), { keepPreviousData: true })
  const { data: cartData } = useQuery('shop-cart', () => shopService.getCart())
  const cats = catData?.categories || []
  const catLabel = (id) => cats.find((c) => c.id === id)?.label || id
  const cartCount = (cartData?.cart?.items || []).reduce((s, i) => s + i.quantity, 0)

  const add = useMutation((id) => shopService.addToCart(id, 1), {
    onSuccess: () => { toast.success('Ajouté au panier'); qc.invalidateQueries('shop-cart') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const products = data?.products || []

  return (
    <div className="space-y-6">
      <PageHeader title="Boutique" subtitle="Mobilier et électroménager pour équiper vos biens en location">
        <Link to="/backoffice/panier" className="relative inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
          <FiShoppingCart className="w-5 h-5" /> Panier
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">{cartCount}</span>
          )}
        </Link>
      </PageHeader>

      <Toolbar>
        <Select value={filter.group} onChange={(e) => setFilter({ ...filter, group: e.target.value, category: '' })}>
          <option value="">Tous les groupes</option>
          <option value="furniture">Meubles</option>
          <option value="appliance">Électroménager</option>
        </Select>
        <Select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
          <option value="">Toutes les catégories</option>
          {cats.filter((c) => !filter.group || c.group === filter.group).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        <SearchInput value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Rechercher un produit…" />
      </Toolbar>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <ProductSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <EmptyState icon={FiShoppingBag} title="Aucun produit" description="Aucun article ne correspond à vos filtres pour le moment." />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              <Link to={`/backoffice/boutique/${p.id}`} className="block h-40 bg-gray-50">
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">🛋️</div>}
              </Link>
              <div className="p-3 flex-1 flex flex-col">
                <p className="text-xs text-gray-400 mb-0.5">{catLabel(p.category)}</p>
                <Link to={`/backoffice/boutique/${p.id}`} className="font-medium text-gray-900 text-sm line-clamp-2 hover:text-primary-600">{p.name}</Link>
                <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                  <span className="font-bold text-gray-900">{p.price} Đh</span>
                  <button
                    onClick={() => add.mutate(p.id)}
                    disabled={p.stock < 1 || add.isLoading}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {p.stock < 1 ? 'Rupture' : (<><FiPlus className="w-3.5 h-3.5" /> Ajouter</>)}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
export default ShopCatalog
