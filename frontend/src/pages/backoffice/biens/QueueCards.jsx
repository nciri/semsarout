import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiAlertTriangle, FiCheck, FiCheckCircle, FiClock, FiEdit2, FiHome, FiSend, FiStar, FiTag } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, IconAction, Kv, Legend, Rich, SegBar, TD, TH } from '../components/kit'
import { TONE_COLORS } from '../components/kitTokens'
import { MAX_RATIO, SHORT_DESCRIPTION, urgentBadge } from './model'
import { RangeAxis, RangeLegend, RangeRow } from './PriceRange'
import { B, useFullMoney, useStatusWhat } from './hooks'
import { KpiStrip, ListingChecks, StatusChip } from './shared'

const where = (p) => [p.city, p.neighborhood].filter(Boolean).join(', ')
const DAY_OPTS = { weekday: 'long', day: 'numeric', month: 'long' }

function useQ(scope) {
  return useTranslation('backoffice', { keyPrefix: `${B}.${scope}` }).t
}

function MiniBar({ label, value, max }) {
  return (
    <div className="grid grid-cols-[86px_1fr_34px] items-center gap-2 text-[12.5px]">
      <span>{label}</span>
      <span className="h-2 overflow-hidden rounded bg-gray-100"><i className="block h-full rounded bg-primary-400" style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></span>
      <span className="text-end font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function Line({ title, sub, end }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
      <b className="truncate font-semibold">{title}</b>
      {sub && <span className="col-start-1 truncate text-[12.5px] text-gray-500">{sub}</span>}
      {end && <span className="col-start-2 row-span-2 row-start-1 self-center">{end}</span>}
    </li>
  )
}

/** « × 9,8 » au-delà de l'échelle, « +45 % » / « −30 % » sinon. */
function useGap() {
  const { fmtNumber } = useFormat()
  return (ratio) => (ratio > MAX_RATIO ? `× ${fmtNumber(ratio, { maximumFractionDigits: 1 })}`
    : `${ratio >= 1 ? '+' : '−'}${Math.round(Math.abs(ratio - 1) * 100)} %`)
}

// ---------- Annonces sans photo ----------
export function PhotosCompact({ q }) {
  const t = useQ('photos')
  const { fmtNumber } = useFormat()
  if (!q.without.count) return <Alert tone="plain" icon={FiCheckCircle}>{t('allGood')}</Alert>
  const max = Math.max(q.with.contacts, q.without.contacts)
  return (
    <>
      <Figure value={q.without.count}>{q.without.contacts ? t('figure') : t('figureNoContact')}</Figure>
      <div className="grid gap-2" aria-label={t('barsLabel')}>
        <MiniBar label={t('with')} value={q.with.contacts} max={max} />
        <MiniBar label={t('without')} value={q.without.contacts} max={max} />
      </div>
      <p className="text-[12.5px] text-gray-500">{t('viewsNote', { with: fmtNumber(q.with.views), without: fmtNumber(q.without.views) })}</p>
    </>
  )
}

export function PhotosDetail({ q, onClose, titleRef }) {
  const t = useQ('photos')
  const { fmtNumber } = useFormat()
  const money = useFullMoney()
  const rate = (s) => `${fmtNumber(s.views ? (s.contacts / s.views) * 100 : 0, { maximumFractionDigits: 1 })} %`
  const visited = q.withVisits[0]
  return (
    <DetailFrame title={t('title')} sub={t('detailSub', { count: q.without.count })} onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!q.rows.length ? <p className="text-sm text-gray-500">{t('allGood')}</p> : (
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('columns.listing')}</th>
              <th className={`${TH} text-end`}>{t('columns.views')}</th>
              <th className={`${TH} text-end`}>{t('columns.contacts')}</th>
              <th className={`${TH} text-end`}>{t('columns.description')}</th>
              <th className={`${TH} text-end`}>{t('columns.visits')}</th>
              <th className={TH}><span className="sr-only">{t('columns.actions')}</span></th>
            </tr></thead>
            <tbody>
              {q.rows.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className={TD}><b className="font-semibold">{p.title}</b><span className="block text-xs text-gray-500">{where(p)} · {money(p)}</span></td>
                  <td className={`${TD} text-end tabular-nums`}>{fmtNumber(p.views_count || 0)}</td>
                  <td className={`${TD} text-end tabular-nums`}>{p.contacts_count || <Chip tone="warn">0</Chip>}</td>
                  <td className={`${TD} whitespace-nowrap text-end tabular-nums`}>{t('chars', { count: p.description_length || 0 })}</td>
                  <td className={`${TD} text-end tabular-nums`}>{p.upcoming || '–'}</td>
                  <td className={`${TD} text-end`}><IconAction icon={FiEdit2} label={t('complete')} to={`/backoffice/biens/${p.id}`} tone="gold" tipAlign="end" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        aside={<>
          <h3 className="font-display text-[13px] font-bold">{t('asideTitle')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Kv label={t('withCount', { n: q.with.count })} value={rate(q.with)} sub={t('ratio', { contacts: q.with.contacts, views: fmtNumber(q.with.views) })} />
            <Kv label={t('withoutCount', { n: q.without.count })} value={rate(q.without)} sub={t('ratio', { contacts: q.without.contacts, views: fmtNumber(q.without.views) })} />
          </div>
          {q.shortDescriptions > 0 && (
            <Alert tone="warn" icon={FiAlertTriangle}><Rich i18nKey={`${B}.photos.shortAlert`} values={{ count: q.shortDescriptions, min: SHORT_DESCRIPTION }} /></Alert>
          )}
          {visited && (
            <Alert tone="plain" icon={FiHome}><Rich i18nKey={`${B}.photos.visitsAlert`} values={{ title: visited.title, count: visited.upcoming }} /></Alert>
          )}
        </>}
      />
    </DetailFrame>
  )
}

// ---------- Prix hors marché ----------
export function PriceCompact({ q, available }) {
  const t = useQ('price')
  const money = useFullMoney()
  const { fmtNumber } = useFormat()
  const gap = useGap()
  if (!available) return <Alert tone="plain" icon={FiAlertCircle}>{t('unavailable')}</Alert>
  if (!q.out.length) return <Alert tone="plain" icon={FiCheckCircle}>{t('allGood', { count: q.compared.length })}</Alert>
  return (
    <>
      <Figure value={q.out.length}>{t('figure')}</Figure>
      <div className="grid gap-2">
        <SegBar label={t('barLabel', { count: q.out.length, above: q.above.length, below: q.below.length })}
          parts={[{ value: q.above.length, color: TONE_COLORS.crit }, { value: q.below.length, color: TONE_COLORS.warn }]} />
        <Legend items={[
          { color: TONE_COLORS.crit, label: t('aboveCount', { n: q.above.length }) },
          { color: TONE_COLORS.warn, label: t('belowCount', { n: q.below.length }) },
        ]} />
      </div>
      <ul className="grid">
        {q.out.slice(0, 2).map((p) => (
          <Line key={p.id} title={p.title}
            sub={t('vsAvg', { value: money.sqm(p, p.market.sqm), avg: fmtNumber(p.market.ref.avg) })}
            end={<Chip tone={p.market.pos === 'above' ? 'crit' : 'warn'}>{gap(p.market.ratio)}</Chip>} />
        ))}
      </ul>
    </>
  )
}

export function PriceDetail({ q, available, onClose, titleRef }) {
  const t = useQ('price')
  const money = useFullMoney()
  const { fmtNumber } = useFormat()
  const worstBelow = q.below.at(-1)
  return (
    <DetailFrame title={t('title')} sub={available ? t('detailSub', { count: q.compared.length }) : t('unavailable')} onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!q.compared.length ? <p className="text-sm text-gray-500">{t('none')}</p> : (
          <div className="grid content-start gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-[13px] font-bold">{t('chartTitle')}</h3>
              <RangeLegend />
            </div>
            <RangeAxis name={t('axisName')} />
            <div className="grid gap-0.5">
              {q.compared.map((p) => (
                <RangeRow key={p.id} row={p} name={p.title} sub={`${p.city} · ${t(`tx.${p.transaction_type}`)}`} />
              ))}
            </div>
          </div>
        )}
        aside={<>
          {q.above.length > 0 && (
            <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey={`${B}.price.aboveAlert`} values={{ count: q.above.length, contacts: q.aboveContacts }} /></Alert>
          )}
          {q.typo && (
            <Alert tone="plain" icon={FiTag}>{t('typoAlert', {
              title: q.typo.title, price: money({ ...q.typo, price: q.typo.price / 10 }),
              sqm: money.sqm(q.typo, q.typo.market.sqm / 10), min: fmtNumber(q.typo.market.ref.min), max: fmtNumber(q.typo.market.ref.max),
            })}</Alert>
          )}
          {worstBelow && (
            <Alert tone="warn" icon={FiAlertTriangle}><Rich i18nKey={`${B}.price.belowAlert`} values={{
              count: q.below.length, title: worstBelow.title, price: money(worstBelow), surface: fmtNumber(worstBelow.surface),
              sqm: money.sqm(worstBelow, worstBelow.market.sqm), min: fmtNumber(worstBelow.market.ref.min), max: fmtNumber(worstBelow.market.ref.max),
            }} /></Alert>
          )}
          {q.noSurface.length > 0 && <p className="text-[12.5px] text-gray-500">{t('noSurface', { count: q.noSurface.length, title: q.noSurface[0].title })}</p>}
          {q.noRef.length > 0 && <p className="text-[12.5px] text-gray-500">{t('noRef', { count: q.noRef.length })}</p>}
        </>}
      />
    </DetailFrame>
  )
}

// ---------- Statuts à corriger ----------
export function StatusCompact({ rows, available }) {
  const t = useQ('status')
  const what = useStatusWhat()
  if (!available) return <Alert tone="plain" icon={FiAlertCircle}>{t('unavailable')}</Alert>
  if (!rows.length) return <Alert tone="plain" icon={FiCheckCircle}>{t('allGood')}</Alert>
  return (
    <>
      <Figure value={rows.length}>{t('figure')}</Figure>
      <ul className="grid">
        {rows.slice(0, 3).map((p) => <Line key={p.id} title={p.title} sub={what(p)} />)}
      </ul>
    </>
  )
}

export function StatusDetail({ rows, onFix, fixing, onClose, titleRef }) {
  const t = useQ('status')
  const money = useFullMoney()
  const what = useStatusWhat()
  return (
    <DetailFrame title={t('title')} sub={t('detailSub')} link={{ to: '/backoffice/transactions', label: t('allTransactions') }} onClose={onClose} titleRef={titleRef}>
      {!rows.length ? <p className="text-sm text-gray-500">{t('allGood')}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('columns.property')}</th>
              <th className={TH}>{t('columns.shown')}</th>
              <th className={TH}>{t('columns.what')}</th>
              <th className={`${TH} text-end`}>{t('columns.fix')}</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const fix = t(`fix.${p.status_check.expected}`)
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className={TD}><b className="font-semibold">{p.title}</b><span className="block text-xs text-gray-500">{where(p)} · {money(p)}</span></td>
                    <td className={TD}><StatusChip status={p.status} /></td>
                    <td className={`${TD} min-w-[260px]`}>{what(p)}</td>
                    <td className={`${TD} text-end`}>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Chip tone={p.status_check.tone}>{fix}</Chip>
                        <IconAction icon={FiCheck} label={t('apply', { fix })} onClick={() => onFix(p, p.status_check.expected)} disabled={fixing} tone="gold" tipAlign="end" />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3.5 text-[12.5px] text-gray-500">{t('why')}</p>
    </DetailFrame>
  )
}

// ---------- Brouillon à republier ----------
function draftFacts(p, t, tb, money, fmtNumber) {
  return [
    tb(`crm.shared.listingTypes.${p.transaction_type}`, { defaultValue: p.transaction_type }),
    money(p),
    p.surface ? `${fmtNumber(p.surface)} m²` : null,
    t('photos', { count: p.images_count || 0 }),
  ].filter(Boolean).join(' · ')
}

function UrgentAlert({ p, now }) {
  const { fmtDate } = useFormat()
  const badge = urgentBadge(p, now)
  if (!badge) return null
  return (
    <Alert tone={badge.running ? 'info' : 'plain'} icon={FiClock}>
      <Rich i18nKey={`${B}.draft.${badge.running ? 'urgentRunning' : 'urgentExpired'}`} values={{ date: fmtDate(badge.until, DAY_OPTS) }} />
    </Alert>
  )
}

export function DraftCompact({ drafts, now }) {
  const t = useQ('draft')
  const { t: tb } = useTranslation('backoffice')
  const money = useFullMoney()
  const { fmtNumber } = useFormat()
  const p = drafts[0]
  if (!p) return <Alert tone="plain" icon={FiCheckCircle}>{t('none')}</Alert>
  return (
    <>
      <div className="grid gap-1 rounded-lg bg-gray-50 px-3.5 py-3">
        <b className="font-semibold">{p.title}{p.city && `, ${p.city}`}</b>
        <span className="text-[12.5px] text-gray-500">{draftFacts(p, t, tb, money, fmtNumber)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kv label={t('favorites')} value={fmtNumber(p.favorites_count || 0)} />
        <Kv label={t('viewsBefore')} value={fmtNumber(p.views_count || 0)} />
      </div>
      <UrgentAlert p={p} now={now} />
      {drafts.length > 1 && <p className="text-[12.5px] text-gray-500">{t('others', { count: drafts.length - 1 })}</p>}
    </>
  )
}

export function DraftDetail({ drafts, now, onRepublish, republishing, onClose, titleRef }) {
  const t = useQ('draft')
  const { t: tb } = useTranslation('backoffice')
  const money = useFullMoney()
  const { fmtNumber } = useFormat()
  const p = drafts[0]
  if (!p) {
    return <DetailFrame title={t('title', { count: 0 })} onClose={onClose} titleRef={titleRef}><p className="text-sm text-gray-500">{t('none')}</p></DetailFrame>
  }
  const sqm = p.surface && p.transaction_type === 'sale' ? money.sqm(p, p.price / p.surface) : null
  return (
    <DetailFrame
      title={p.title}
      sub={[p.reference, where(p), tb(`crm.shared.propertyTypes.${p.property_type}`, { defaultValue: p.property_type })].filter(Boolean).join(' · ')}
      controls={<>
        <IconAction icon={FiEdit2} label={tb('crm.properties.list.edit')} to={`/backoffice/biens/${p.id}`} tone="gold" />
        <IconAction icon={FiSend} label={t('republish')} onClick={() => onRepublish(p)} disabled={republishing} tone="primary" />
      </>}
      onClose={onClose}
      titleRef={titleRef}
    >
      <DetailColumns
        main={<div className="grid content-start gap-5">
          <KpiStrip items={[
            { label: t('kpi.price'), value: fmtNumber(Math.round(p.price || 0)), unit: money.unit(p), sub: sqm },
            { label: t('viewsBefore'), value: fmtNumber(p.views_count || 0), sub: t('kpi.contacts', { count: p.contacts_count || 0 }) },
            { label: t('favorites'), value: fmtNumber(p.favorites_count || 0), sub: t('kpi.toNotify') },
            { label: t('kpi.photos'), value: fmtNumber(p.images_count || 0), sub: t('kpi.description', { count: p.description_length || 0 }) },
          ]} />
          <ListingChecks p={p} />
        </div>}
        aside={<>
          <UrgentAlert p={p} now={now} />
          {p.favorites_count > 0 && <Alert tone="plain" icon={FiStar}>{t('favoritesAlert', { count: p.favorites_count })}</Alert>}
          {!p.price_ref && p.neighborhood && <p className="text-[12.5px] text-gray-500">{t('noRef', { neighborhood: p.neighborhood })}</p>}
          {drafts.length > 1 && (<>
            <h3 className="font-display text-[13px] font-bold">{t('othersTitle', { count: drafts.length - 1 })}</h3>
            <ul className="grid">
              {drafts.slice(1).map((d) => (
                <Line key={d.id} title={d.title} sub={draftFacts(d, t, tb, money, fmtNumber)}
                  end={<IconAction icon={FiEdit2} label={tb('crm.properties.list.edit')} to={`/backoffice/biens/${d.id}`} tipAlign="end" />} />
              ))}
            </ul>
          </>)}
        </>}
      />
    </DetailFrame>
  )
}
