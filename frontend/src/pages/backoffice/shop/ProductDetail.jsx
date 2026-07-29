import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiPlus } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'

function ProductDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['shop-product', id], () => shopService.product(id))
  const [qty, setQty] = useState(1)
  const add = useMutation(() => shopService.addToCart(Number(id), qty), {
    onSuccess: () => { toast.success('Ajouté au panier'); qc.invalidateQueries('shop-cart') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (isLoading) return <div className="animate-pulse space-y-6 max-w-4xl"><div className="h-4 w-32 bg-gray-200 rounded" /><div className="grid md:grid-cols-2 gap-6"><div className="h-72 bg-gray-200 rounded-xl" /><div className="space-y-3"><div className="h-7 bg-gray-200 rounded w-2/3" /><div className="h-6 bg-gray-200 rounded w-1/3" /></div></div></div>
  if (isError || !data?.product) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
        Produit introuvable. <Link to="/backoffice/boutique" className="text-primary-600 hover:underline">Retour à la boutique</Link>
      </div>
    )
  }
  const p = data.product
  const outOfStock = p.stock < 1

  return (
    <div className="space-y-4 max-w-4xl">
      <Link to="/backoffice/boutique" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Boutique
      </Link>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden grid md:grid-cols-2">
        <div className="h-72 md:h-full min-h-[18rem] bg-gray-50">
          {p.image_url
            ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-gray-300 text-6xl">🛋️</div>}
        </div>
        <div className="p-6 flex flex-col">
          <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
          <p className="text-2xl font-bold text-primary-700 mt-2">{p.price} Đh</p>
          <p className={`text-sm mt-1 ${outOfStock ? 'text-red-600' : 'text-gray-500'}`}>
            {outOfStock ? 'En rupture de stock' : `${p.stock} en stock`}
          </p>
          {p.description && <p className="text-gray-700 mt-4 whitespace-pre-line leading-relaxed">{p.description}</p>}
          <div className="flex items-center gap-3 mt-6">
            <input
              type="number" min="1" max={p.stock}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={() => add.mutate()}
              disabled={outOfStock || add.isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FiPlus className="w-5 h-5" /> Ajouter au panier
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default ProductDetail
