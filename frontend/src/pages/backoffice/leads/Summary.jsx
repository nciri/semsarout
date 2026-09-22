import { useTranslation } from 'react-i18next'
import { FiArrowDown, FiInbox, FiPieChart, FiUserCheck } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Figure, IconAction, Legend, SegBar } from '../components/kit'
import { TONE_COLORS } from '../components/kitTokens'
import { SOURCE_COLORS, agingBuckets, daysSince } from '../dashboard/model'
import { conversionOf, sourceShares } from './model'

const K = 'crm.pipeline.leads.summary'

function Card({ id, title, icon: Icon, action, children }) {
  return (
    <section aria-labelledby={`leads-sum-${id}`} className="grid content-start gap-3.5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex min-h-[20px] items-center justify-between gap-2.5">
        <h2 id={`leads-sum-${id}`} className="flex items-center gap-2 font-display text-[14.5px] font-bold">
          <Icon className="w-[17px] h-[17px] text-gray-400" aria-hidden="true" />{title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Synthèse : leads jamais contactés par ancienneté, répartition par source, conversion. */
export default function Summary({ pending, stats, now, source, onShowPending, onSource }) {
  const { t } = useTranslation('backoffice')
  const { fmtNumber } = useFormat()
  const b = agingBuckets(pending, now)
  const oldest = pending.length ? Math.max(...pending.map((l) => daysSince(l.created_at, now))) : 0
  const shares = sourceShares(stats?.by_source)
  const conv = conversionOf(stats?.by_status)
  const steps = ['received', 'contacted', 'qualified', 'converted']

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card
        id="pending"
        title={t(`${K}.pending.title`)}
        icon={FiInbox}
        action={pending.length > 0 && (
          <IconAction icon={FiArrowDown} label={t(`${K}.pending.show`)} onClick={onShowPending} tone="gold" tipAlign="end" className="-m-2" />
        )}
      >
        {!pending.length ? <p className="text-sm text-gray-500">{t(`${K}.pending.empty`)}</p> : (
          <>
            <Figure value={pending.length}>{t(`${K}.pending.headline`, { count: pending.length })}</Figure>
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
            <p className="text-[12.5px] text-gray-500">{t(`${K}.pending.oldest`, { count: oldest })}</p>
          </>
        )}
      </Card>

      <Card id="sources" title={t(`${K}.sources.title`)} icon={FiPieChart}>
        <Figure value={shares.total}>{t(`${K}.sources.headline`, { count: shares.total })}</Figure>
        <ul className="grid gap-1">
          {shares.rows.map(({ source: s, count }) => {
            const body = (
              <>
                <span className="truncate text-start">
                  <span className="me-1.5 inline-block w-2.5 h-2.5 rounded-[3px] align-[-1px]" style={{ background: SOURCE_COLORS[s] || '#9AA0AB' }} />
                  {t(`crm.pipeline.leads.source.${s}`)}
                </span>
                <span className="h-2 overflow-hidden rounded bg-gray-100">
                  <i className="block h-full rounded" style={{ width: `${shares.total ? (count / shares.total) * 100 : 0}%`, background: SOURCE_COLORS[s] || '#9AA0AB' }} />
                </span>
                <span className="text-end tabular-nums">{count}</span>
              </>
            )
            const cls = 'grid w-full grid-cols-[minmax(0,8.5rem)_1fr_2rem] items-center gap-2.5 rounded-md px-1.5 py-1 text-[12.5px]'
            return (
              <li key={s}>
                {s === 'other' ? <div className={cls}>{body}</div> : (
                  <button
                    type="button"
                    aria-pressed={source === s}
                    aria-label={t(`${K}.sources.filter`, { source: t(`crm.pipeline.leads.source.${s}`), count })}
                    onClick={() => onSource(source === s ? '' : s)}
                    className={`${cls} hover:bg-gray-50 ${source === s ? 'bg-primary-50 font-semibold' : ''}`}
                  >
                    {body}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card id="conversion" title={t(`${K}.conversion.title`)} icon={FiUserCheck}>
        <Figure value={fmtNumber(conv.rate * 100, { maximumFractionDigits: 0 })} unit="%">
          {t(`${K}.conversion.headline`, { converted: conv.converted, count: conv.received })}
        </Figure>
        <ol className="grid gap-1.5" aria-label={t(`${K}.conversion.funnel`)}>
          {steps.map((k) => (
            <li key={k} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2.5 text-[12.5px]">
              <span className="text-gray-600">{t(`${K}.conversion.steps.${k}`)}</span>
              <span className="h-2 overflow-hidden rounded bg-gray-100">
                <i className="block h-full rounded bg-primary-400" style={{ width: `${conv.received ? (conv[k] / conv.received) * 100 : 0}%` }} />
              </span>
              <span className="text-end font-semibold tabular-nums">{conv[k]}</span>
            </li>
          ))}
        </ol>
        {conv.lost > 0 && <p className="text-[12.5px] text-gray-500">{t(`${K}.conversion.lost`, { count: conv.lost })}</p>}
      </Card>
    </div>
  )
}
