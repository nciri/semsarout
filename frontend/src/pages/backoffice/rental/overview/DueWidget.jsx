import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCalendar, FiExternalLink, FiSend } from 'react-icons/fi'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, IconAction, Rich, TD, TH } from '../../components/kit'
import { DueChip } from '../parts'
import { useRentalFormat } from '../hooks'

const ficheOf = (x) => `/backoffice/gestion-locative/${x.kind === 'lease' ? 'baux' : 'mandats'}/${x.id}`

function Undated({ undated }) {
  const { t } = useTranslation('backoffice')
  if (!undated.leases && !undated.mandates) return null
  return (
    <Alert tone="plain" icon={FiCalendar}>
      {t('rental.overview.due.undated', {
        leases: t('rental.overview.leaseCount', { count: undated.leases }),
        mandates: t('rental.overview.mandateCount', { count: undated.mandates }),
      })}
    </Alert>
  )
}

/** Ce qui manque à une échéance proche pour être prête. */
function gap(x) {
  if (x.kind === 'lease') return x.exit_inventory ? null : 'noExit'
  return x.notice_sent ? null : 'noNotice'
}

export function DueCompact({ s }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const { items, days, undated } = s.expiring
  if (!items.length) {
    return <>
      <p className="text-sm text-gray-500">{t('rental.overview.due.none', { count: days })}</p>
      <Undated undated={undated} />
    </>
  }
  const week = items.filter((x) => x.days_left <= 7).length
  const [next, ...rest] = items
  return (
    <>
      <Figure value={items.length}>
        {t('rental.overview.due.within', { count: days })}
        {week > 0 && <span className="ms-2 align-[2px]"><Chip tone="crit">{t('rental.overview.due.thisWeek', { count: week })}</Chip></span>}
      </Figure>
      <div className="grid gap-1 rounded-lg bg-gray-50 px-3.5 py-3">
        <span className="text-[13px] font-bold">
          <span className="capitalize text-primary-700">{f.date(next.end_date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          {' · '}{next.days_left === 0 ? t('rental.overview.today') : t('rental.overview.inDays', { count: next.days_left })}
        </span>
        <span><b>{t(`rental.overview.due.endOf.${next.kind}`, { name: next.party_name || next.reference })}</b> · {next.property_title}</span>
        {gap(next) && <span className="text-[12.5px] text-gray-500">{t(`rental.overview.due.gap.${gap(next)}`)}</span>}
      </div>
      <ul className="grid">
        {rest.slice(0, 3).map((x) => (
          <li key={`${x.kind}-${x.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
            <b className="truncate font-semibold">{t(`rental.overview.kind.${x.kind}`)} · {x.property_title || x.reference}</b>
            <span className="row-span-2 self-center"><DueChip days={x.days_left} /></span>
            <span className="truncate text-[12.5px] text-gray-500">
              {t(`rental.overview.due.party.${x.kind}`, { name: x.party_name || '—' })} · {f.date(x.end_date, { day: 'numeric', month: 'long' })}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

export function DueDetail({ s, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const { items, days, undated } = s.expiring
  const horizon = new Date(Date.now() + days * 86400000)
  const urgentLease = items.find((x) => x.kind === 'lease' && x.days_left <= 14 && !x.exit_inventory)
  const noNotice = items.find((x) => x.kind === 'mandate' && !x.notice_sent)

  return (
    <DetailFrame title={t('rental.overview.due.title')}
      sub={t('rental.overview.due.detailSub', { count: items.length, date: f.date(horizon, { day: 'numeric', month: 'long', year: 'numeric' }) })}
      onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!items.length ? <p className="text-sm text-gray-500">{t('rental.overview.due.none', { count: days })}</p> : (
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('rental.overview.due.columns.date')}</th>
              <th className={TH}>{t('rental.overview.due.columns.contract')}</th>
              <th className={TH}>{t('rental.overview.due.columns.property')}</th>
              <th className={TH}>{t('rental.overview.due.columns.party')}</th>
              <th className={`${TH} text-end`}>{t('rental.overview.due.columns.in')}</th>
              <th className={`${TH} text-end`}><span className="sr-only">{t('rental.overview.actions')}</span></th>
            </tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={`${x.kind}-${x.id}`} className="hover:bg-gray-50">
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{f.date(x.end_date, { day: 'numeric', month: 'long' })}</td>
                  <td className={TD}>{t(`rental.overview.kind.${x.kind}`)}<span className="block text-xs text-gray-500">{x.reference}</span></td>
                  <td className={TD}><b className="font-semibold">{x.property_title || '—'}</b><span className="block text-xs text-gray-500">{x.property_city}</span></td>
                  <td className={TD}>{x.party_name || '—'}</td>
                  <td className={`${TD} text-end`}><DueChip days={x.days_left} /></td>
                  <td className={`${TD} text-end`}><IconAction icon={FiExternalLink} label={t(`rental.overview.open.${x.kind}`)} to={ficheOf(x)} tone="gold" tipAlign="end" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        aside={<>
          {urgentLease && <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey="rental.overview.due.urgentLease" values={{ title: urgentLease.property_title || urgentLease.reference, count: urgentLease.days_left }} /></Alert>}
          {noNotice && <Alert tone="warn" icon={FiSend}><Rich i18nKey="rental.overview.due.noNoticeAlert" values={{ title: noNotice.property_title || noNotice.reference, date: f.date(noNotice.end_date, { day: 'numeric', month: 'long' }), name: noNotice.party_name || '—' }} /></Alert>}
          <Undated undated={undated} />
          <p className="m-0 text-[12.5px] text-gray-500">{t('rental.overview.due.note')}</p>
        </>}
      />
    </DetailFrame>
  )
}
