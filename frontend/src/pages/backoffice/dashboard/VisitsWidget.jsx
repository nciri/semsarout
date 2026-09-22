import { useTranslation } from 'react-i18next'
import { FiClock } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, Kv, Legend, Rich, SegBar } from '../components/kit'
import { TONE_COLORS } from '../components/kitTokens'
import { dayOffset, weekDays } from './model'

const STATUS_TONE = { scheduled: 'warn', confirmed: 'good', completed: 'good', cancelled: 'neutral', no_show: 'crit' }

function StatusChip({ status }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={STATUS_TONE[status] || 'neutral'}>{t(`dashboard.visits.status.${status}`, { defaultValue: status })}</Chip>
}

/** « Aujourd'hui », « Demain », sinon le jour de la semaine. */
function useDayLabel(now) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  return (iso) => {
    const off = dayOffset(iso, now)
    if (off === 0) return t('dashboard.visits.today')
    if (off === 1) return t('dashboard.visits.tomorrow')
    const s = fmtDate(iso, { weekday: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
}

export function VisitsCompact({ visits, now }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate, fmtTime } = useFormat()
  const dayLabel = useDayLabel(now)
  if (!visits.length) return <p className="text-sm text-gray-500">{t('dashboard.visits.empty')}</p>

  const week = weekDays(visits, now)
  const thisWeek = week.reduce((n, d) => n + d.count, 0)
  const toConfirm = visits.filter((v) => v.status === 'scheduled').length
  const next = visits[0]

  return (
    <>
      <Figure value={visits.length}>{t('dashboard.visits.thisWeek', { count: thisWeek })}</Figure>
      {toConfirm > 0 && <span><Chip tone="warn">{t('dashboard.visits.toConfirm', { count: toConfirm })}</Chip></span>}
      <div className="grid gap-1 rounded-lg bg-gray-50 px-3.5 py-3">
        <span className="text-[13px] font-bold">
          <span className="text-primary-700">{dayLabel(next.scheduled_at)}</span>
          {' · '}{fmtDate(next.scheduled_at, { weekday: 'long', day: 'numeric', month: 'long' })}, {fmtTime(next.scheduled_at)}
        </span>
        <span className="truncate"><b className="font-semibold">{next.contact_name || t('dashboard.visits.visitor')}</b>{next.property_title ? ` · ${next.property_title}` : ''}</span>
        <span><StatusChip status={next.status} /></span>
      </div>
      <div aria-label={t('dashboard.visits.weekLabel')} className="grid grid-cols-7 gap-1.5 text-center text-[11.5px] text-gray-500">
        {week.map((d) => (
          <div key={d.date.toISOString()} className="grid justify-items-center gap-1">
            <span className={`grid h-[26px] w-full place-items-center rounded-md text-[12.5px] font-bold tabular-nums ${
              d.count ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
            } ${d.isToday ? 'ring-[1.5px] ring-inset ring-gray-900' : ''}`}>{d.count}</span>
            {fmtDate(d.date, { weekday: 'short' })}
          </div>
        ))}
      </div>
    </>
  )
}

export function VisitsDetail({ visits, outcomes, now, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate, fmtTime } = useFormat()
  const dayLabel = useDayLabel(now)
  const days = [...new Map(visits.map((v) => [new Date(v.scheduled_at).toDateString(), v.scheduled_at]))]
  const o = outcomes || { days: 15, completed: 0, cancelled: 0, no_show: 0, total: 0 }
  const missed = o.cancelled + o.no_show

  return (
    <DetailFrame
      title={t('dashboard.visits.title')}
      sub={visits.length ? t('dashboard.visits.detailSub', { count: visits.length, date: fmtDate(visits.at(-1).scheduled_at, { day: 'numeric', month: 'long' }) }) : null}
      link={{ to: '/backoffice/visites', label: t('dashboard.visits.viewAll') }}
      onClose={onClose}
      titleRef={titleRef}
    >
      <DetailColumns
        main={!visits.length ? <p className="text-sm text-gray-500">{t('dashboard.visits.empty')}</p> : days.map(([key, iso]) => (
          <div key={key} className="grid gap-3.5 border-t border-gray-100 py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[96px_1fr]">
            <div className="text-[13px] font-bold">
              {dayLabel(iso)}
              <span className="block text-xs font-medium text-gray-500">{fmtDate(iso, { day: 'numeric', month: 'long' })}</span>
            </div>
            <div>
              {visits.filter((v) => new Date(v.scheduled_at).toDateString() === key).map((v) => (
                <div key={v.id} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2.5 py-0.5">
                  <span className="font-semibold tabular-nums text-gray-600">{fmtTime(v.scheduled_at)}</span>
                  <span className="truncate"><b className="font-semibold">{v.contact_name || t('dashboard.visits.visitor')}</b>
                    {v.property_title && <span className="text-[12.5px] text-gray-500"> · {v.property_title}</span>}</span>
                  <StatusChip status={v.status} />
                </div>
              ))}
            </div>
          </div>
        ))}
        aside={<>
          <h3 className="font-display text-[13px] font-bold">{t('dashboard.visits.recentTitle', { days: o.days })}</h3>
          {!o.total ? <p className="text-[12.5px] text-gray-500">{t('dashboard.visits.noRecent', { days: o.days })}</p> : <>
            <div className="grid grid-cols-2 gap-3">
              <Kv label={t('dashboard.visits.honoured')} value={o.completed} unit={t('dashboard.visits.outOf', { count: o.total })} />
              <Kv label={t('dashboard.visits.attendance')} value={`${Math.round((o.completed / o.total) * 100)} %`} />
            </div>
            <SegBar
              label={t('dashboard.visits.outcomesLabel', { honoured: o.completed, cancelled: o.cancelled, absent: o.no_show })}
              parts={[{ value: o.completed, color: TONE_COLORS.good }, { value: o.cancelled, color: '#B9B4AB' }, { value: o.no_show, color: TONE_COLORS.crit }]}
            />
            <Legend items={[
              { color: TONE_COLORS.good, label: `${t('dashboard.visits.honoured')} ${o.completed}` },
              { color: '#B9B4AB', label: `${t('dashboard.visits.cancelled')} ${o.cancelled}` },
              { color: TONE_COLORS.crit, label: `${t('dashboard.visits.absent')} ${o.no_show}` },
            ]} />
            {missed > 0 && <Alert tone="warn" icon={FiClock}><Rich i18nKey="dashboard.visits.missedAlert" values={{ missed, total: o.total }} /></Alert>}
          </>}
        </>}
      />
    </DetailFrame>
  )
}
