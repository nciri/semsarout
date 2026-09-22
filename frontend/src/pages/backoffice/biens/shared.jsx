import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiBox, FiCheck, FiEdit2, FiExternalLink, FiFilePlus, FiTrash2 } from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'
import { useFormat } from '../../../utils/format'
import { Chip, IconAction } from '../components/kit'
import { STATUS_TONE, listingChecks } from './model'
import { B } from './hooks'

export function StatusChip({ status }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={STATUS_TONE[status] || 'neutral'}>{t(`crm.properties.status.${status}`, { defaultValue: status })}</Chip>
}

export function SignalChips({ signals }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.signals` })
  const { fmtNumber } = useFormat()
  if (!signals.length) return <span className="text-[12.5px] text-gray-500">{t('none')}</span>
  return (
    <span className="flex flex-wrap gap-1">
      {signals.map(([tone, code, v = {}]) => (
        <Chip key={code} tone={tone}>{t(code, { ...v, ratio: v.ratio && fmtNumber(v.ratio, { maximumFractionDigits: 1 }) })}</Chip>
      ))}
    </span>
  )
}

/** Bandeau de chiffres (4 colonnes, 2 sur mobile) des vues détaillées. */
export function KpiStrip({ items }) {
  return (
    <div className="grid grid-cols-2 rounded-lg border border-gray-200 lg:grid-cols-4">
      {items.map((k, i) => (
        <div key={k.label} className={`grid content-start gap-0.5 px-4 py-3.5 ${i % 2 === 0 ? 'border-e border-gray-200' : ''} ${i < 2 ? 'border-b border-gray-200 lg:border-b-0' : ''} ${i === 1 ? 'lg:border-e' : ''}`}>
          <span className="text-xs font-medium text-gray-500">{k.label}</span>
          <span className="font-display text-[22px] font-extrabold tabular-nums">
            {k.value}{k.unit && <small className="ms-1 text-[12.5px] font-bold text-gray-600">{k.unit}</small>}
          </span>
          {k.sub && <span className="text-xs text-gray-500">{k.sub}</span>}
        </div>
      ))}
    </div>
  )
}

const CHECK_TONE = { ok: 'text-gray-900', meh: 'text-amber-700', bad: 'text-red-700' }

/** Fiche de l'annonce : photos, description, surface, pièces, énergie, mise en ligne. */
export function ListingChecks({ p }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.checks` })
  const { fmtNumber, fmtDate } = useFormat()
  const value = (c) => {
    if (c.key === 'photos') return c.value ? fmtNumber(c.value) : t('none')
    if (c.key === 'description') return t('chars', { count: c.value })
    if (c.key === 'surface') return c.value ? `${fmtNumber(c.value)} m²` : t('missing')
    if (c.key === 'published') return c.value ? fmtDate(c.value, { day: 'numeric', month: 'long', year: 'numeric' }) : t('noDate')
    return c.value ?? t('missing')
  }
  return (
    <div className="grid content-start gap-2.5">
      <h3 className="font-display text-[13px] font-bold">{t('title')}</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {listingChecks(p).map((c) => (
          <div key={c.key} className="grid gap-px rounded-lg bg-gray-50 px-3 py-2.5">
            <span className="text-xs text-gray-500">{t(c.key)}</span>
            <span className={`flex items-center gap-1.5 font-semibold ${CHECK_TONE[c.state]}`}>
              {c.state === 'ok' && <FiCheck className="h-[15px] w-[15px] text-green-700" aria-hidden="true" />}
              {c.state === 'bad' && <FiAlertCircle className="h-[15px] w-[15px]" aria-hidden="true" />}
              {value(c)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Les actions d'un bien, en icônes : celles de l'ancien menu « ⋮ », dans le même ordre. */
export function ItemActions({ p, onDelete, className = '' }) {
  const { t } = useTranslation(['backoffice', 'dashboard'])
  const hasFeature = useAuthStore((s) => s.hasFeature)
  const tx = `/backoffice/transactions/nouveau?property_id=${p.id}&type=${p.transaction_type === 'rent' ? 'rent' : 'sale'}`
  return (
    <span className={`flex items-center gap-0.5 ${className}`}>
      <IconAction icon={FiExternalLink} label={t('crm.properties.list.viewOnline')} to={`/annonces/${p.id}`} target="_blank" rel="noopener noreferrer" />
      <IconAction icon={FiEdit2} label={t('crm.properties.list.edit')} to={`/backoffice/biens/${p.id}`} />
      {hasFeature('design3d') && (
        <IconAction icon={FiBox} label={t('dashboard:designEditor.entry')} to={`/dashboard/conception?target_type=property&target_id=${p.id}`} />
      )}
      <IconAction icon={FiFilePlus} label={t('crm.properties.list.newTransaction')} to={tx} tipAlign="end" />
      <IconAction icon={FiTrash2} label={t('crm.properties.list.delete')} onClick={() => onDelete(p)} tone="danger" tipAlign="end" />
    </span>
  )
}

export function DetailPanel({ shown, notch, children }) {
  return (
    <div
      id="dashboard-detail"
      role="region"
      aria-labelledby="dashboard-detail-title"
      className="col-span-full grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: shown ? '1fr' : '0fr' }}
    >
      <div className="min-h-0 overflow-hidden pt-2.5">
        <div className="relative rounded-xl border border-primary-400 bg-white shadow-[0_1px_2px_rgba(11,18,32,.04),0_14px_30px_-20px_rgba(11,18,32,.25)]">
          <span aria-hidden="true" className="absolute -top-[8px] h-3.5 w-3.5 -ms-[7px] rotate-45 border-s border-t border-primary-400 bg-white" style={{ insetInlineStart: notch }} />
          {children}
        </div>
      </div>
    </div>
  )
}
