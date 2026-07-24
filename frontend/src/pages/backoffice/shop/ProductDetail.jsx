import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
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
  if (isLoading) return <div className="p-8">Chargement…</div>
  if (isError || !data?.product) return <div className="p-8 text-center text-gray-500">Produit introuvable. <Link to="/backoffice/boutique" className="text-primary-600 underline">Retour</Link></div>
  const p = data.product
  return (
    <div className="p-6 max-w-3xl grid md:grid-cols-2 gap-6">
      <div className="h-64 bg-gray-100 rounded-xl overflow-hidden">
        {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-6xl">🛋️</div>}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
        <p className="text-xl font-bold text-primary-600 mt-2">{p.price} MAD</p>
        <p className="text-sm text-gray-500 mt-1">Stock : {p.stock}</p>
        <p className="text-gray-700 mt-4 whitespace-pre-line">{p.description}</p>
        <div className="flex items-center gap-3 mt-6">
          <input type="number" min="1" max={p.stock} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />
          <button onClick={() => add.mutate()} disabled={p.stock < 1} className="btn-primary disabled:opacity-40">Ajouter au panier</button>
        </div>
      </div>
    </div>
  )
}
export default ProductDetail
