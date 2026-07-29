import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiTrash2 } from 'react-icons/fi'
import { shopService } from '../../services/shopService'

const CATS = [['lit', 'Lit'], ['canape', 'Canapé'], ['table', 'Table'], ['armoire', 'Armoire'], ['chaise', 'Chaise'], ['bureau', 'Bureau'],
  ['refrigerateur', 'Réfrigérateur'], ['lave_linge', 'Lave-linge'], ['four', 'Four'], ['micro_ondes', 'Micro-ondes'], ['climatiseur', 'Climatiseur'], ['television', 'Télévision']]
const EMPTY = { category: 'lit', name: '', price: '', stock: '', image_url: '', description: '' }

function AdminProducts() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('admin-products', () => shopService.adminListProducts())
  const [form, setForm] = useState(EMPTY)
  const create = useMutation(() => shopService.adminCreateProduct({ ...form, price: Number(form.price) || 0, stock: Number(form.stock) || 0 }), {
    onSuccess: () => { toast.success('Produit ajouté'); setForm(EMPTY); qc.invalidateQueries('admin-products') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => shopService.adminDeleteProduct(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('admin-products') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const toggle = useMutation(({ id, is_active }) => shopService.adminUpdateProduct(id, { is_active }), { onSuccess: () => qc.invalidateQueries('admin-products') })

  if (isLoading) return <div>Chargement…</div>
  const products = data?.products || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Catalogue produits</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3">Nom</th><th>Prix</th><th>Stock</th><th>Actif</th><th></th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{p.name}</td><td>{p.price} Đh</td><td>{p.stock}</td>
                  <td><input type="checkbox" checked={p.is_active} onChange={(e) => toggle.mutate({ id: p.id, is_active: e.target.checked })} /></td>
                  <td className="text-right"><button onClick={() => del.mutate(p.id)} className="text-red-600"><FiTrash2 /></button></td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400">Aucun produit.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 h-fit">
          <h2 className="font-semibold text-midnight mb-3">Ajouter un produit</h2>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900">
            {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {[['name', 'Nom *'], ['price', 'Prix (Đh)'], ['stock', 'Stock'], ['image_url', "URL image"]].map(([f, ph]) => (
            <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} placeholder={ph} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          ))}
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows="2" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          <button disabled={!form.name} onClick={() => create.mutate()} className="w-full px-4 py-2 rounded-lg bg-midnight text-ivory text-sm disabled:opacity-50">Ajouter</button>
        </div>
      </div>
    </div>
  )
}
export default AdminProducts
