import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { adminService } from '../../services/adminService'
import { priceWithSymbol } from '../../utils/currency'
import { useFormat } from '../../utils/format'

/**
 * Grille tarifaire de la plateforme — un seul endroit pour tout ce qui est facturable.
 *
 * Les montants vivaient dans quatre fichiers, dont un seul faisait autorité sur ce qui était
 * prélevé. Ici, ce qui est enregistré est ce que le site affiche ET ce que le client paie.
 */
function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-midnight mb-3">{title}</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">{children}</div>
    </section>
  )
}

function AdminPricing() {
  const { t } = useTranslation(['admin', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [draftNew, setDraftNew] = useState({ code: '', amount: '', kind: 'one_off' })

  const { data, isLoading } = useQuery(['admin', 'pricing'], adminService.getPricing)
  const { data: history } = useQuery(['admin', 'price-changes'], adminService.getPriceChanges)

  const refresh = () => {
    qc.invalidateQueries(['admin', 'pricing'])
    qc.invalidateQueries(['admin', 'price-changes'])
    // Le site lit le même catalogue : sans cette invalidation, l'administrateur verrait son
    // nouveau prix et les pages publiques l'ancien, jusqu'à expiration du cache.
    qc.invalidateQueries('pricing')
  }
  const onError = () => toast.error(t('admin:pricing.saveError'))

  const saveService = useMutation(({ code, amount }) => adminService.setServicePrice(code, amount),
    { onSuccess: () => { toast.success(t('admin:pricing.saved')); refresh() }, onError })
  const toggleService = useMutation(({ code, isActive }) => adminService.toggleServicePrice(code, isActive),
    { onSuccess: refresh, onError })
  const savePlan = useMutation(({ id, prices }) => adminService.setPlanPrice(id, prices),
    { onSuccess: () => { toast.success(t('admin:pricing.saved')); refresh() }, onError })
  const createService = useMutation((payload) => adminService.createServicePrice(payload), {
    onSuccess: () => {
      toast.success(t('admin:pricing.created'))
      setDraftNew({ code: '', amount: '', kind: 'one_off' })
      refresh()
    },
    onError: (e) => toast.error(e?.response?.data?.error || t('admin:pricing.saveError')),
  })

  if (isLoading) return <p>{t('admin:shared.loading')}</p>

  const services = data?.services || []
  const plans = data?.plans || []
  const draft = (key, fallback) => (drafts[key] !== undefined ? drafts[key] : String(fallback ?? ''))
  const setDraft = (key, value) => setDrafts((d) => ({ ...d, [key]: value }))

  // Le serveur refuse déjà un montant non positif ; le dire ici évite un aller-retour et
  // explique la règle à l'endroit où elle est enfreinte.
  const parsed = (key, fallback) => {
    const n = Number(draft(key, fallback))
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const submitService = (code, amount) => {
    const value = parsed(code, amount)
    if (value === null) {
      setError(t('admin:pricing.invalidAmount'))
      return
    }
    setError('')
    saveService.mutate({ code, amount: value })
  }

  const submitPlan = (plan) => {
    const monthly = parsed(`plan:${plan.id}:monthly`, plan.price_monthly)
    const yearly = parsed(`plan:${plan.id}:yearly`, plan.price_yearly)
    if (monthly === null || yearly === null) {
      setError(t('admin:pricing.invalidAmount'))
      return
    }
    setError('')
    savePlan.mutate({ id: plan.id, prices: { price_monthly: monthly, price_yearly: yearly } })
  }

  // Le serveur refuse déjà ces cas ; les dire ici évite un aller-retour et explique la règle
  // là où elle est enfreinte.
  const submitNew = () => {
    const code = draftNew.code.trim().toLowerCase()
    const amount = Number(draftNew.amount)
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(code)) {
      setError(t('admin:pricing.invalidCode'))
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('admin:pricing.invalidAmount'))
      return
    }
    setError('')
    createService.mutate({ code, amount, kind: draftNew.kind })
  }

  const amountField = (label, key, value) => (
    <input
      aria-label={label}
      type="number"
      min="1"
      value={draft(key, value)}
      onChange={(e) => setDraft(key, e.target.value)}
      className="w-32 border border-slate-300 rounded-md px-3 py-2 text-sm"
    />
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-2">{t('admin:pricing.title')}</h1>
      <p className="text-sm text-slate-500 mb-6">{t('admin:pricing.subtitle')}</p>
      {error && (
        <p role="alert" className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </p>
      )}

      <Section title={t('admin:pricing.servicesTitle')}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('admin:pricing.table.code')}</th>
              <th className="px-4 py-3">{t('admin:pricing.table.amount')}</th>
              <th className="px-4 py-3">{t('admin:pricing.table.kind')}</th>
              <th className="px-4 py-3">{t('admin:pricing.table.active')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.code} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{s.code}</td>
                <td className="px-4 py-3">{amountField(s.code, s.code, s.amount)}</td>
                <td className="px-4 py-3 text-slate-500">{t(`admin:pricing.kinds.${s.kind}`, { defaultValue: s.kind })}</td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={t('admin:pricing.activateLabel', { code: s.code })}
                    checked={s.is_active !== false}
                    onChange={(e) => toggleService.mutate({ code: s.code, isActive: e.target.checked })}
                  />
                </td>
                <td className="px-4 py-3 text-end">
                  <button type="button" className="btn-secondary min-h-[44px]"
                          onClick={() => submitService(s.code, s.amount)}>
                    {t('admin:pricing.save', { name: s.code })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t('admin:pricing.newTitle')}>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-500 mb-1">{t('admin:pricing.table.code')}</span>
            <input
              aria-label={t('admin:pricing.table.code')}
              value={draftNew.code}
              onChange={(e) => setDraftNew((d) => ({ ...d, code: e.target.value }))}
              placeholder="diagnostic-energetique"
              className="w-64 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500 mb-1">{t('admin:pricing.table.amount')}</span>
            <input
              aria-label={t('admin:pricing.table.amount')}
              type="number"
              min="1"
              value={draftNew.amount}
              onChange={(e) => setDraftNew((d) => ({ ...d, amount: e.target.value }))}
              className="w-32 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500 mb-1">{t('admin:pricing.table.kind')}</span>
            <select
              aria-label={t('admin:pricing.table.kind')}
              value={draftNew.kind}
              onChange={(e) => setDraftNew((d) => ({ ...d, kind: e.target.value }))}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="one_off">{t('admin:pricing.kinds.one_off')}</option>
              <option value="recurring_monthly">{t('admin:pricing.kinds.recurring_monthly')}</option>
            </select>
          </label>
          <button type="button" className="btn-primary min-h-[44px]" onClick={submitNew}>
            {t('admin:pricing.add')}
          </button>
        </div>
      </Section>

      <Section title={t('admin:pricing.plansTitle')}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('admin:pricing.table.plan')}</th>
              <th className="px-4 py-3">{t('admin:pricing.table.monthly')}</th>
              <th className="px-4 py-3">{t('admin:pricing.table.yearly')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">
                  {amountField(t('admin:pricing.monthlyLabel', { name: p.name }), `plan:${p.id}:monthly`, p.price_monthly)}
                </td>
                <td className="px-4 py-3">
                  {amountField(t('admin:pricing.yearlyLabel', { name: p.name }), `plan:${p.id}:yearly`, p.price_yearly)}
                </td>
                <td className="px-4 py-3 text-end">
                  <button type="button" className="btn-secondary min-h-[44px]" onClick={() => submitPlan(p)}>
                    {t('admin:pricing.save', { name: p.name })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t('admin:pricing.historyTitle')}>
        <ul className="divide-y divide-slate-100 text-sm">
          {(history?.changes || []).length === 0 && (
            <li className="px-4 py-3 text-slate-500">{t('admin:pricing.noHistory')}</li>
          )}
          {(history?.changes || []).map((c) => (
            <li key={c.id} className="px-4 py-3 flex flex-wrap gap-x-2">
              <span className="font-medium">{c.code}</span>
              <span className="text-slate-500">
                {c.old_amount !== null ? priceWithSymbol(c.old_amount) : '—'} → {priceWithSymbol(c.new_amount)}
              </span>
              <span className="text-slate-400">
                {t('admin:pricing.changedBy', { id: c.changed_by, date: fmtDate(c.changed_at) })}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

export default AdminPricing
