import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiPlus, FiTrash2, FiTrendingUp } from 'react-icons/fi'
import { marketService } from '../../services/marketService'
import useAuthStore from '../../store/authStore'
import { useFormat } from '../../utils/format'

const LOT_TYPES = [
  { value: '', labelKey: 'all' },
  { value: 'apartment', labelKey: 'apartment' },
  { value: 'villa', labelKey: 'villa' },
  { value: 'house', labelKey: 'house' },
  { value: 'land', labelKey: 'land' },
  { value: 'commercial', labelKey: 'commercial' },
  { value: 'office', labelKey: 'office' }
]

const EMPTY = {
  city: '', neighborhood: '', property_type: '', transaction_type: 'sale',
  avg_price_sqm: '', min_price_sqm: '', max_price_sqm: '', source: 'manuel'
}

export default function MarketPrices() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { fmtNumber } = useFormat()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY)

  const isAdmin = user?.user_type === 'admin' || user?.account_role === 'admin'

  const { data: refs = [], isLoading } = useQuery(
    'market-refs', marketService.getReferences, { enabled: isAdmin }
  )

  const createMutation = useMutation(marketService.createReference, {
    onSuccess: () => { queryClient.invalidateQueries('market-refs'); setForm(EMPTY); toast.success(t('dashboard:marketPrices.toasts.added')) },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short'))
  })
  const deleteMutation = useMutation(marketService.deleteReference, {
    onSuccess: () => { queryClient.invalidateQueries('market-refs'); toast.success(t('dashboard:marketPrices.toasts.deleted')) }
  })

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">
        {t('dashboard:marketPrices.adminOnly')}
      </div>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.city || !form.neighborhood || !form.avg_price_sqm) {
      toast.error(t('dashboard:marketPrices.requiredFields')); return
    }
    createMutation.mutate({
      ...form,
      property_type: form.property_type || null,
      avg_price_sqm: Number(form.avg_price_sqm),
      min_price_sqm: form.min_price_sqm ? Number(form.min_price_sqm) : null,
      max_price_sqm: form.max_price_sqm ? Number(form.max_price_sqm) : null
    })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center gap-3">
        <FiTrendingUp className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">{t('dashboard:marketPrices.title')}</h1>
          <p className="text-gray-600">
            {t('dashboard:marketPrices.subtitle')}
          </p>
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={submit} className="card p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <input className="input" placeholder={t('dashboard:marketPrices.form.city')} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
        <input className="input" placeholder={t('dashboard:marketPrices.form.neighborhood')} value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} />
        <select className="input" value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })}>
          <option value="sale">{t('dashboard:marketPrices.transactionType.sale')}</option>
          <option value="rent">{t('dashboard:marketPrices.transactionType.rent')}</option>
        </select>
        <select className="input" value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}>
          {LOT_TYPES.map(lt => <option key={lt.value} value={lt.value}>{t(`dashboard:marketPrices.lotTypes.${lt.labelKey}`)}</option>)}
        </select>
        <input className="input" type="number" placeholder={t('dashboard:marketPrices.form.avgPrice')} value={form.avg_price_sqm} onChange={e => setForm({ ...form, avg_price_sqm: e.target.value })} />
        <input className="input" type="number" placeholder={t('dashboard:marketPrices.form.minPrice')} value={form.min_price_sqm} onChange={e => setForm({ ...form, min_price_sqm: e.target.value })} />
        <input className="input" type="number" placeholder={t('dashboard:marketPrices.form.maxPrice')} value={form.max_price_sqm} onChange={e => setForm({ ...form, max_price_sqm: e.target.value })} />
        <button type="submit" disabled={createMutation.isLoading} className="btn-primary justify-center">
          <FiPlus className="w-4 h-4 me-1" /> {t('dashboard:shared.actions.add')}
        </button>
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 animate-pulse text-gray-400 text-center">{t('dashboard:shared.loading')}</div>
        ) : refs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{t('dashboard:marketPrices.empty')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-start">
              <tr>
                <th className="px-4 py-3">{t('dashboard:marketPrices.columns.city')}</th>
                <th className="px-4 py-3">{t('dashboard:marketPrices.columns.neighborhood')}</th>
                <th className="px-4 py-3">{t('dashboard:marketPrices.columns.transaction')}</th>
                <th className="px-4 py-3">{t('dashboard:marketPrices.columns.type')}</th>
                <th className="px-4 py-3 text-end">{t('dashboard:marketPrices.columns.avgPrice')}</th>
                <th className="px-4 py-3 text-end">{t('dashboard:marketPrices.columns.minMax')}</th>
                <th className="px-4 py-3">{t('dashboard:marketPrices.columns.source')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {refs.map(r => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{r.city}</td>
                  <td className="px-4 py-3">{r.neighborhood}</td>
                  <td className="px-4 py-3">{r.transaction_type === 'rent' ? t('dashboard:marketPrices.transactionType.rent') : t('dashboard:marketPrices.transactionType.sale')}</td>
                  <td className="px-4 py-3">{t(`dashboard:marketPrices.lotTypes.${LOT_TYPES.find(lt => lt.value === (r.property_type || ''))?.labelKey}`, { defaultValue: r.property_type })}</td>
                  <td className="px-4 py-3 text-end font-medium">{fmtNumber(Math.round(r.avg_price_sqm))}</td>
                  <td className="px-4 py-3 text-end text-gray-500">
                    {r.min_price_sqm ? fmtNumber(Math.round(r.min_price_sqm)) : '—'} – {r.max_price_sqm ? fmtNumber(Math.round(r.max_price_sqm)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.source}</td>
                  <td className="px-4 py-3 text-end">
                    <button onClick={() => deleteMutation.mutate(r.id)} className="p-1.5 text-gray-400 hover:text-red-600">
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
