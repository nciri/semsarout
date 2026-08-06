import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiTrash2 } from 'react-icons/fi'
import { shopService } from '../../services/shopService'

const CATS = ['lit', 'canape', 'table', 'armoire', 'chaise', 'bureau', 'refrigerateur', 'lave_linge', 'four', 'micro_ondes', 'climatiseur', 'television']
const EMPTY = { category: 'lit', name: '', price: '', stock: '', image_url: '', description: '' }

function AdminProducts() {
  const { t } = useTranslation(['admin', 'common'])
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('admin-products', () => shopService.adminListProducts())
  const [form, setForm] = useState(EMPTY)
  const create = useMutation(() => shopService.adminCreateProduct({ ...form, price: Number(form.price) || 0, stock: Number(form.stock) || 0 }), {
    onSuccess: () => { toast.success(t('admin:products.toasts.added')); setForm(EMPTY); qc.invalidateQueries('admin-products') },
    onError: (e) => toast.error(e.response?.data?.error || t('admin:products.toasts.error')),
  })
  const del = useMutation((id) => shopService.adminDeleteProduct(id), {
    onSuccess: () => { toast.success(t('admin:products.toasts.deleted')); qc.invalidateQueries('admin-products') },
    onError: (e) => toast.error(e.response?.data?.error || t('admin:products.toasts.error')),
  })
  const toggle = useMutation(({ id, is_active }) => shopService.adminUpdateProduct(id, { is_active }), { onSuccess: () => qc.invalidateQueries('admin-products') })

  if (isLoading) return <div>{t('admin:shared.loading')}</div>
  const products = data?.products || []
  const fields = [['name', t('admin:products.fields.name')], ['price', t('admin:products.fields.price')], ['stock', t('admin:products.fields.stock')], ['image_url', t('admin:products.fields.imageUrl')]]
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">{t('admin:products.title')}</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3">{t('admin:products.table.name')}</th><th>{t('admin:products.table.price')}</th><th>{t('admin:products.table.stock')}</th><th>{t('admin:products.table.active')}</th><th></th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{p.name}</td><td>{p.price} Đh</td><td>{p.stock}</td>
                  <td><input type="checkbox" checked={p.is_active} onChange={(e) => toggle.mutate({ id: p.id, is_active: e.target.checked })} /></td>
                  <td className="text-end"><button onClick={() => del.mutate(p.id)} className="text-red-600"><FiTrash2 /></button></td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400">{t('admin:products.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 h-fit">
          <h2 className="font-semibold text-midnight mb-3">{t('admin:products.addTitle')}</h2>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900">
            {CATS.map((v) => <option key={v} value={v}>{t(`admin:products.categories.${v}`, { defaultValue: v })}</option>)}
          </select>
          {fields.map(([f, ph]) => (
            <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} placeholder={ph} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          ))}
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('admin:products.fields.description')} rows="2" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          <button disabled={!form.name} onClick={() => create.mutate()} className="w-full px-4 py-2 rounded-lg bg-midnight text-ivory text-sm disabled:opacity-50">{t('admin:products.addButton')}</button>
        </div>
      </div>
    </div>
  )
}
export default AdminProducts
