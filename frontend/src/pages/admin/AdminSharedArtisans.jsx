import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiTrash2 } from 'react-icons/fi'
import { artisanService } from '../../services/artisanService'

const TRADES = ['plombier', 'electricien', 'menage', 'menuisier', 'peintre', 'archi_interieur', 'macon', 'chauffagiste', 'serrurier', 'jardinier', 'autre']
const EMPTY = { trade: 'plombier', name: '', company: '', city: '', phone: '', email: '' }

function AdminSharedArtisans() {
  const { t } = useTranslation(['admin', 'common'])
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('shared-artisans', () => artisanService.listShared())
  const [form, setForm] = useState(EMPTY)

  const create = useMutation(() => artisanService.createShared(form), {
    onSuccess: () => { toast.success(t('admin:sharedArtisans.toasts.added')); setForm(EMPTY); qc.invalidateQueries('shared-artisans') },
    onError: (e) => toast.error(e.response?.data?.error || t('admin:sharedArtisans.toasts.error')),
  })
  const del = useMutation((id) => artisanService.deleteShared(id), {
    onSuccess: () => { toast.success(t('admin:sharedArtisans.toasts.deleted')); qc.invalidateQueries('shared-artisans') },
    onError: (e) => toast.error(e.response?.data?.error || t('admin:sharedArtisans.toasts.error')),
  })

  if (isLoading) return <div>{t('admin:shared.loading')}</div>
  const artisans = data?.artisans || []
  const fieldPlaceholders = {
    name: t('admin:sharedArtisans.fields.name'),
    company: t('admin:sharedArtisans.fields.company'),
    city: t('admin:sharedArtisans.fields.city'),
    phone: t('admin:sharedArtisans.fields.phone'),
    email: t('admin:sharedArtisans.fields.email'),
  }
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">{t('admin:sharedArtisans.title')}</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr>
              <th className="px-4 py-3">{t('admin:sharedArtisans.table.name')}</th><th>{t('admin:sharedArtisans.table.trade')}</th><th>{t('admin:sharedArtisans.table.city')}</th><th></th></tr></thead>
            <tbody>
              {artisans.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td>{t(`admin:sharedArtisans.trades.${a.trade}`, { defaultValue: a.trade })}</td><td>{a.city}</td>
                  <td className="text-end"><button onClick={() => del.mutate(a.id)} className="text-red-600"><FiTrash2 /></button></td>
                </tr>
              ))}
              {artisans.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">{t('admin:sharedArtisans.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 h-fit">
          <h2 className="font-semibold text-midnight mb-3">{t('admin:sharedArtisans.addTitle')}</h2>
          <select value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900">
            {TRADES.map((v) => <option key={v} value={v}>{t(`admin:sharedArtisans.trades.${v}`, { defaultValue: v })}</option>)}
          </select>
          {['name', 'company', 'city', 'phone', 'email'].map((f) => (
            <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                   placeholder={fieldPlaceholders[f]}
                   className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          ))}
          <button disabled={!form.name} onClick={() => create.mutate()} className="w-full px-4 py-2 rounded-lg bg-midnight text-ivory text-sm disabled:opacity-50">{t('admin:sharedArtisans.addButton')}</button>
        </div>
      </div>
    </div>
  )
}
export default AdminSharedArtisans
