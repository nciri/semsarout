import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiUsers } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, Legend, Rich, SegBar, TD, TH } from '../components/kit'
import { TONE_COLORS } from '../components/kitTokens'
import { SOURCES, SOURCE_COLORS, agingBuckets, agingTone, daysSince, repeatedContacts } from './model'

function AgeChip({ days }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={agingTone(days)}>{t('dashboard.units.days', { count: days })}</Chip>
}

const sourceLabel = (t, s) => t(`dashboard.sources.${SOURCES.includes(s) ? s : 'other'}`)

export function LeadsCompact({ leads, now }) {
  const { t } = useTranslation('backoffice')
  const b = agingBuckets(leads, now)
  if (!leads.length) return <p className="text-sm text-gray-500">{t('dashboard.leads.empty')}</p>

  // Un contact qui a écrit plusieurs fois n'apparaît qu'une fois, sur sa demande la plus ancienne.
  const repeats = new Map(repeatedContacts(leads).map((r) => [r.name, r.count]))
  const seen = new Set()
  const oldest = leads.filter((l) => {
    const key = l.name || `#${l.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)

  return (
    <>
      <Figure value={leads.length}>{t('dashboard.leads.headline', { count: leads.length })}</Figure>
      <div className="grid gap-2">
        <SegBar
          label={t('dashboard.leads.agingLabel', b)}
          parts={[{ value: b.fresh, color: TONE_COLORS.good }, { value: b.recent, color: TONE_COLORS.warn }, { value: b.stale, color: TONE_COLORS.crit }]}
        />
        <Legend items={[
          { color: TONE_COLORS.good, label: `${t('dashboard.leads.buckets.fresh')} · ${b.fresh}` },
          { color: TONE_COLORS.warn, label: `${t('dashboard.leads.buckets.recent')} · ${b.recent}` },
          { color: TONE_COLORS.crit, label: `${t('dashboard.leads.buckets.stale')} · ${b.stale}` },
        ]} />
      </div>
      <ul aria-label={t('dashboard.leads.oldest')} className="grid">
        {oldest.map((l) => (
          <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
            <b className="truncate font-semibold">{l.name || t('dashboard.leads.noName')}</b>
            <span className="row-span-2 self-center"><AgeChip days={daysSince(l.created_at, now)} /></span>
            <span className="truncate text-[12.5px] text-gray-500">
              {repeats.get(l.name) > 1
                ? t('dashboard.leads.repeat', { count: repeats.get(l.name) })
                : `${l.property_title || t('dashboard.leads.noProperty')} · ${sourceLabel(t, l.source)}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

export function LeadsDetail({ leads, now, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const b = agingBuckets(leads, now)
  const top = repeatedContacts(leads)[0]
  const bySource = SOURCES.map((s) => [s, leads.filter((l) => l.source === s).length])

  return (
    <DetailFrame
      title={t('dashboard.leads.title')}
      sub={t('dashboard.leads.detailSub', { count: leads.length })}
      link={{ to: '/backoffice/leads', label: t('dashboard.leads.viewAll') }}
      onClose={onClose}
      titleRef={titleRef}
    >
      {!leads.length ? <p className="text-sm text-gray-500">{t('dashboard.leads.empty')}</p> : (
        <DetailColumns
          main={
            <table className="w-full text-[13px]">
              <thead><tr>
                <th className={TH}>{t('dashboard.leads.columns.contact')}</th>
                <th className={TH}>{t('dashboard.leads.columns.property')}</th>
                <th className={TH}>{t('dashboard.leads.columns.source')}</th>
                <th className={TH}>{t('dashboard.leads.columns.received')}</th>
                <th className={`${TH} text-end`}>{t('dashboard.leads.columns.waiting')}</th>
              </tr></thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className={TD}><b className="font-semibold">{l.name || t('dashboard.leads.noName')}</b></td>
                    <td className={TD}>{l.property_title || t('dashboard.leads.noProperty')}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className="me-1.5 inline-block w-2.5 h-2.5 rounded-[3px] align-[-1px]" style={{ background: SOURCE_COLORS[l.source] || '#9AA0AB' }} />
                      {sourceLabel(t, l.source)}
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(l.created_at, { day: 'numeric', month: 'short' })}</td>
                    <td className={`${TD} text-end`}><AgeChip days={daysSince(l.created_at, now)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          aside={<>
            {b.stale > 0 && <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey="dashboard.leads.staleAlert" values={{ count: b.stale }} /></Alert>}
            {top && <Alert tone="warn" icon={FiUsers}><Rich i18nKey="dashboard.leads.repeatAlert" values={top} /></Alert>}
            <h3 className="font-display text-[13px] font-bold">{t('dashboard.leads.bySource')}</h3>
            {bySource.map(([s, n]) => (
              <div key={s} className="grid grid-cols-[1fr_auto] items-center gap-2.5">
                <span className="h-2 overflow-hidden rounded bg-gray-100"><i className="block h-full rounded" style={{ width: `${(n / leads.length) * 100}%`, background: SOURCE_COLORS[s] }} /></span>
                <span className="text-[12.5px] tabular-nums">{sourceLabel(t, s)} · {n}</span>
              </div>
            ))}
          </>}
        />
      )}
    </DetailFrame>
  )
}
