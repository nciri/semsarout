import { useState } from 'react'
import { useMutation } from 'react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { FiArrowLeft, FiHome, FiTrendingUp } from 'react-icons/fi'
import { marketService } from '../../../services/marketService'
import { MOROCCAN_CITIES, PROPERTY_TYPES } from '../../../constants/property'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, Kv } from '../components/kit'

const P = 'estimation'
const CONDITIONS = ['new', 'good', 'refresh', 'renovate']
const EXTRAS = ['parking', 'terrace', 'pool']
const CONFIDENCE_TONE = { high: 'good', medium: 'warn', low: 'crit' }

const FIELD = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none'

function Field({ label, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12.5px] font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  )
}

/** Formulaire d'estimation : quelques paramètres, une fourchette, et les biens qui la justifient. */
export default function Estimation() {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtNumber } = useFormat()
  const [params] = useSearchParams()
  const [form, setForm] = useState(() => ({
    city: params.get('city') || MOROCCAN_CITIES[0],
    neighborhood: params.get('neighborhood') || '',
    property_type: params.get('property_type') || PROPERTY_TYPES[0].value,
    transaction_type: params.get('transaction_type') || 'sale',
    surface: params.get('surface') || '',
    condition: 'good',
    floor: '',
    total_floors: '',
    has_elevator: false,
    construction_year: '',
    features: [],
  }))

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }
  const toggleFeature = (code) => setForm((f) => ({
    ...f,
    features: f.features.includes(code) ? f.features.filter((x) => x !== code) : [...f.features, code],
  }))

  const num = (v) => (v === '' || v === null ? null : Number(v))
  const run = useMutation(() => marketService.estimate({
    ...form,
    surface: num(form.surface),
    floor: num(form.floor),
    total_floors: num(form.total_floors),
    construction_year: num(form.construction_year),
  }))

  const result = run.data
  const money = (v) => `${fmtNumber(Math.round(v))} ${t('currency')}`

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-gray-500">{t('subtitle')}</p>
        </div>
        <Link to="/backoffice/biens" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900">
          <FiArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />{t('backToProperties')}
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <form
          onSubmit={(e) => { e.preventDefault(); run.mutate() }}
          className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fields.city')}>
              <select className={FIELD} value={form.city} onChange={set('city')}>
                {MOROCCAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t('fields.neighborhood')}>
              <input className={FIELD} value={form.neighborhood} onChange={set('neighborhood')}
                placeholder={t('fields.neighborhoodPlaceholder')} />
            </Field>
            <Field label={t('fields.propertyType')}>
              <select className={FIELD} value={form.property_type} onChange={set('property_type')}>
                {PROPERTY_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label={t('fields.transactionType')}>
              <select className={FIELD} value={form.transaction_type} onChange={set('transaction_type')}>
                <option value="sale">{t('transaction.sale')}</option>
                <option value="rent">{t('transaction.rent')}</option>
              </select>
            </Field>
            <Field label={t('fields.surface')}>
              <input className={FIELD} type="number" min="5" value={form.surface} onChange={set('surface')} required />
            </Field>
            <Field label={t('fields.condition')}>
              <select className={FIELD} value={form.condition} onChange={set('condition')}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{t(`conditions.${c}`)}</option>)}
              </select>
            </Field>
            <Field label={t('fields.floor')}>
              <input className={FIELD} type="number" min="0" value={form.floor} onChange={set('floor')} />
            </Field>
            <Field label={t('fields.totalFloors')}>
              <input className={FIELD} type="number" min="1" value={form.total_floors} onChange={set('total_floors')} />
            </Field>
            <Field label={t('fields.constructionYear')}>
              <input className={FIELD} type="number" min="1900" value={form.construction_year} onChange={set('construction_year')} />
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-[12.5px] font-semibold text-gray-700">{t('fields.extras')}</legend>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.has_elevator} onChange={set('has_elevator')} />
                {t('features.elevator')}
              </label>
              {EXTRAS.map((code) => (
                <label key={code} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.features.includes(code)} onChange={() => toggleFeature(code)} />
                  {t(`features.${code}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" disabled={run.isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-400 px-4 py-2 text-sm font-semibold text-[#241906] transition-colors hover:bg-primary-600 disabled:opacity-60">
            <FiTrendingUp className="h-[18px] w-[18px]" aria-hidden="true" />
            {run.isLoading ? t('estimating') : t('estimate')}
          </button>
        </form>

        <section aria-live="polite" className="grid gap-4">
          {run.isError && (
            <Alert tone="crit">{run.error?.response?.data?.error || t('error')}</Alert>
          )}

          {result && !result.available && (
            <Alert tone="warn">{t('unavailable')}</Alert>
          )}

          {result?.available && (
            <>
              <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold">{t('result.title')}</h2>
                  <Chip tone={CONFIDENCE_TONE[result.confidence]}>{t(`confidence.${result.confidence}`)}</Chip>
                </div>
                <p className="font-display text-[30px] font-extrabold leading-none tracking-tight tabular-nums">
                  {money(result.estimate)}
                  {result.transaction_type === 'rent' && <span className="ms-1 text-base font-bold text-gray-500">{t('perMonth')}</span>}
                </p>
                <p className="text-sm text-gray-600">
                  {t('result.range', { low: money(result.estimate_low), high: money(result.estimate_high) })}
                </p>
                <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                  <Kv label={t('result.priceSqm')} value={fmtNumber(Math.round(result.price_sqm))} unit={t('perSqm')} />
                  <Kv label={t('result.referenceSqm')} value={fmtNumber(Math.round(result.reference_price_sqm))} unit={t('perSqm')}
                    sub={result.scope_label} />
                </div>
                {/* L'agence doit pouvoir défendre le chiffre devant son client : on montre d'où il vient. */}
                {result.adjustments.length > 0 && (
                  <ul className="grid gap-1 border-t border-gray-100 pt-3 text-[13px]">
                    {result.adjustments.map((a) => (
                      <li key={a.code} className="flex justify-between gap-3">
                        <span className="text-gray-600">{t(`adjustments.${a.code}`, { defaultValue: a.code })}</span>
                        <span className={`font-semibold tabular-nums ${a.pct < 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {a.pct > 0 ? '+' : ''}{a.pct} %
                        </span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 border-t border-gray-100 pt-1 font-semibold">
                      <span>{t('result.totalAdjustment')}</span>
                      <span className="tabular-nums">{result.adjustment_pct > 0 ? '+' : ''}{result.adjustment_pct} %</span>
                    </li>
                  </ul>
                )}
                <p className="text-[12.5px] text-gray-500">
                  {result.sample_size
                    ? t('result.basedOnListings', { count: result.sample_size })
                    : t('result.basedOnReference')}
                </p>
              </div>

              {result.comparables.length > 0 && (
                <div className="grid gap-2 rounded-xl border border-gray-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 font-display text-base font-bold">
                    <FiHome className="h-[18px] w-[18px] text-gray-400" aria-hidden="true" />{t('comparables.title')}
                  </h2>
                  <ul className="grid">
                    {result.comparables.map((c) => (
                      <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-gray-100 py-2 text-sm first:border-t-0">
                        <span className="min-w-0 truncate">
                          {c.neighborhood || result.city} · {fmtNumber(c.surface)} {t('sqm')}
                        </span>
                        <span className="font-semibold tabular-nums">{fmtNumber(Math.round(c.price_sqm))} {t('perSqm')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
