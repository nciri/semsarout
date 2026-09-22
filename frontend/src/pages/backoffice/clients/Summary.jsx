import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCheck, FiHome, FiMail, FiUser, FiUsers } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, IconAction, Kv, Legend, Rich, SegBar, TD, TH } from '../components/kit'
import { TONE_COLORS } from '../components/kitTokens'
import { AgeChip, ClientCell } from './ui'
import { P, useBudget, useClientLabels, useCurrent } from './labels'
import { byUrgency, OVERDUE_DAYS, relanceBuckets } from './model'

const NEVER_COLOR = '#870B15'
const h3 = 'font-display text-[13px] font-bold'
const note = 'text-[12.5px] text-gray-500'

function MiniList({ label, items }) {
  return (
    <ul aria-label={label} className="grid">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
          <b className="truncate font-semibold">{it.title}</b>
          <span className="col-start-2 row-span-2 row-start-1 self-center">{it.end}</span>
          <span className="truncate text-[12.5px] text-gray-500">{it.sub}</span>
        </li>
      ))}
    </ul>
  )
}

function OpenAction({ d, onOpen }) {
  const { t } = useTranslation('backoffice')
  return <IconAction icon={FiUser} tone="gold" tipAlign="end" label={t(`${P}.openFiche`, { name: d.name })} onClick={() => onOpen(d.id)} />
}

const names = (ds) => ds.map((d) => d.name).join(', ')

/* ---- Relances en retard ---- */

function useRelanceSub() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const current = useCurrent()
  const { typeLine } = useClientLabels()
  return (d) => (d.staleLeads.length
    ? t(`${P}.relances.staleLead`, { date: fmtDate(d.staleLeads[0].created_at, { day: 'numeric', month: 'long' }) })
    : current(d) || typeLine(d.client))
}

export function RelancesCompact({ dossiers }) {
  const { t } = useTranslation('backoffice')
  const sub = useRelanceSub()
  const b = relanceBuckets(dossiers)
  const late = dossiers.filter((d) => d.overdue).sort(byUrgency)
  const parts = [
    { key: 'fresh', color: TONE_COLORS.good }, { key: 'mid', color: TONE_COLORS.warn },
    { key: 'late', color: TONE_COLORS.crit }, { key: 'never', color: NEVER_COLOR },
  ]
  return (
    <>
      <Figure value={late.length}>{t(`${P}.relances.figure`, { count: late.length, days: OVERDUE_DAYS })}</Figure>
      <div className="grid gap-2">
        <SegBar label={t(`${P}.relances.barLabel`, b)} parts={parts.map((p) => ({ value: b[p.key], color: p.color }))} />
        <Legend items={parts.map((p) => ({ color: p.color, label: `${t(`${P}.relances.buckets.${p.key}`)} · ${b[p.key]}` }))} />
      </div>
      {late.length > 0 && (
        <MiniList
          label={t(`${P}.relances.topLabel`)}
          items={late.slice(0, 3).map((d) => ({ key: d.id, title: d.name, sub: sub(d), end: <AgeChip age={d.age} /> }))}
        />
      )}
    </>
  )
}

export function RelancesDetail({ dossiers, onOpen, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const current = useCurrent()
  const rows = dossiers.filter((d) => d.overdue).sort(byUrgency)
  const never = rows.filter((d) => d.age === null).length
  const unfollowed = rows.filter((d) => d.txActive.length)
  const stale = dossiers.filter((d) => d.staleLeads.length)
  const agents = [...new Set(dossiers.filter((d) => d.client.assigned_to_name).map((d) => d.client.assigned_to_name))].sort()
  const per = agents.map((a) => ({
    a, late: rows.filter((d) => d.client.assigned_to_name === a).length,
    total: dossiers.filter((d) => d.client.assigned_to_name === a && d.client.status !== 'inactive').length,
  }))
  return (
    <DetailFrame
      title={t(`${P}.relances.title`)}
      sub={t(`${P}.relances.detailSub`, { count: rows.length, days: OVERDUE_DAYS, never })}
      onClose={onClose}
      titleRef={titleRef}
    >
      <DetailColumns
        main={!rows.length ? <p className="text-sm text-gray-500">{t(`${P}.relances.none`)}</p> : (
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>
              <th className={TH}>{t(`${P}.cols.client`)}</th>
              <th className={`${TH} max-sm:hidden`}>{t(`${P}.cols.agent`)}</th>
              <th className={`${TH} max-sm:hidden`}>{t(`${P}.cols.current`)}</th>
              <th className={`${TH} text-end`}>{t(`${P}.cols.silence`)}</th>
              <th className={TH}><span className="sr-only">{t(`${P}.cols.actions`)}</span></th>
            </tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className={TD}><ClientCell d={d} /></td>
                <td className={`${TD} max-sm:hidden`}>{d.client.assigned_to_name || '—'}</td>
                <td className={`${TD} max-sm:hidden`}>{current(d) || <span className="text-gray-500">{t(`${P}.current.nothing`)}</span>}</td>
                <td className={`${TD} text-end`}><AgeChip age={d.age} /></td>
                <td className={`${TD} text-end`}><OpenAction d={d} onOpen={onOpen} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        aside={<>
          {unfollowed.length > 0 && (
            <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey={`${P}.relances.unfollowed`} values={{ count: unfollowed.length, names: names(unfollowed) }} /></Alert>
          )}
          {stale.length > 0 && (
            <Alert tone="warn" icon={FiMail}><Rich i18nKey={`${P}.relances.staleLeads`} values={{ count: stale.length, names: names(stale) }} /></Alert>
          )}
          {per.length > 0 && <>
            <h3 className={h3}>{t(`${P}.relances.perAgent`)}</h3>
            {per.map((p) => (
              <div key={p.a} className="grid grid-cols-[1fr_minmax(96px,auto)] items-center gap-2">
                <span className="h-2 overflow-hidden rounded bg-gray-100">
                  <i className="block h-full rounded bg-red-700" style={{ width: `${p.total ? (p.late / p.total) * 100 : 0}%` }} />
                </span>
                <span className="text-[12.5px] tabular-nums">{t(`${P}.relances.agentLine`, { name: p.a.split(' ')[0], late: p.late, total: p.total })}</span>
              </div>
            ))}
            <p className={note}>{t(`${P}.relances.perAgentNote`)}</p>
          </>}
        </>}
      />
    </DetailFrame>
  )
}

/* ---- Visites sans offre ---- */

function useVisitSub() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const short = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' })
  return ({ d, v }) => {
    const up = d.upcoming.find((u) => u.property_id === v.property_id)
    if (up) return t(`${P}.offers.revisits`, { date: short(up.scheduled_at) })
    if (d.client.status === 'inactive') return t(`${P}.offers.markedInactive`)
    if (d.txActive.length) return t(`${P}.offers.otherTx`)
    return t(`${P}.offers.visitedOn`, { date: short(v.scheduled_at) })
  }
}

function Feedback({ value }) {
  const { t } = useTranslation('backoffice')
  if (!value) return null
  return <Chip tone={value === 'very_interested' ? 'gold' : 'neutral'}>{t(`${P}.feedback.${value}`, { defaultValue: value })}</Chip>
}

function BudgetAlert({ match }) {
  if (!match.buyers) return null
  return (
    <Alert tone="plain" icon={FiHome}>
      <Rich i18nKey={match.matched ? `${P}.offers.budgetSome` : `${P}.offers.budgetNone`} values={{ count: match.buyers, matched: match.matched }} />
    </Alert>
  )
}

export function OffersCompact({ rows, match }) {
  const { t } = useTranslation('backoffice')
  const sub = useVisitSub()
  const clients = new Set(rows.map((r) => r.d.id)).size
  const hot = rows.filter((r) => r.v.client_feedback === 'very_interested')
  const hotClients = new Set(hot.map((r) => r.d.id)).size
  const shown = [...new Map([...hot, ...rows].map((r) => [r.d.id, r])).values()].slice(0, 3)
  return (
    <>
      <Figure value={clients}>{t(`${P}.offers.figure`, { count: clients })}</Figure>
      {hotClients > 0 && <span><Chip tone="warn">{t(`${P}.offers.hotChip`, { count: hotClients })}</Chip></span>}
      {shown.length > 0 && (
        <MiniList
          label={t(`${P}.offers.topLabel`)}
          items={shown.map((r) => ({ key: r.d.id, title: r.d.name, sub: `${r.v.property_title || ''} · ${sub(r)}`, end: <Feedback value={r.v.client_feedback} /> }))}
        />
      )}
      <BudgetAlert match={match} />
    </>
  )
}

export function OffersDetail({ rows, hot, match, onOpen, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const sub = useVisitSub()
  const veryInterested = rows.filter((r) => r.v.client_feedback === 'very_interested').length
  const neutral = rows.filter((r) => r.v.client_feedback === 'neutral').length
  return (
    <DetailFrame title={t(`${P}.offers.title`)} sub={t(`${P}.offers.detailSub`, { count: rows.length })} onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!rows.length ? <p className="text-sm text-gray-500">{t(`${P}.offers.none`)}</p> : (
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>
              <th className={TH}>{t(`${P}.cols.client`)}</th>
              <th className={`${TH} max-sm:hidden`}>{t(`${P}.cols.property`)}</th>
              <th className={TH}>{t(`${P}.cols.visit`)}</th>
              <th className={`${TH} max-sm:hidden`}>{t(`${P}.cols.feedback`)}</th>
              <th className={`${TH} max-md:hidden`}>{t(`${P}.cols.since`)}</th>
              <th className={TH}><span className="sr-only">{t(`${P}.cols.actions`)}</span></th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.v.id} className="hover:bg-gray-50">
                <td className={TD}><ClientCell d={r.d} /></td>
                <td className={`${TD} max-sm:hidden`}>{r.v.property_title || '—'}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(r.v.scheduled_at, { day: 'numeric', month: 'short' })}</td>
                <td className={`${TD} max-sm:hidden`}><Feedback value={r.v.client_feedback} /></td>
                <td className={`${TD} text-[12.5px] text-gray-500 max-md:hidden`}>{sub(r)}</td>
                <td className={`${TD} text-end`}><OpenAction d={r.d} onOpen={onOpen} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        aside={<>
          <div className="grid grid-cols-2 gap-3">
            <Kv label={t(`${P}.offers.veryInterested`)} value={veryInterested} unit={t(`${P}.offers.outOf`, { count: rows.length })} />
            <Kv label={t(`${P}.offers.neutral`)} value={neutral} />
          </div>
          {hot.map((p) => (
            <Alert key={p.id} tone="info" icon={FiHome}>
              <Rich i18nKey={`${P}.offers.hotProperty`} values={{ property: p.title || '', count: p.names.length, names: p.names.join(', ') }} />
            </Alert>
          ))}
          <BudgetAlert match={match} />
          <p className={note}>{t(`${P}.offers.note`)}</p>
        </>}
      />
    </DetailFrame>
  )
}

/* ---- Fiches à corriger ---- */

export function FixesCompact({ f }) {
  const { t } = useTranslation('backoffice')
  const budget = useBudget()
  const maxes = f.budget.map((d) => d.client.budget_max)
  const items = [
    { key: 'dups', sub: [...new Set(f.dups.map((d) => d.name))].join(', ') || t(`${P}.fixes.noneFound`),
      end: <Chip tone={f.pairs ? 'warn' : 'good'}>{t(`${P}.fixes.pairs`, { count: f.pairs })}</Chip> },
    { key: 'inactive', sub: t(`${P}.fixes.inactiveSub`), end: <Chip tone={f.inactive.length ? 'warn' : 'good'}>{f.inactive.length}</Chip> },
    { key: 'budget', sub: f.budget.length ? t(`${P}.fixes.budgetSub`, { range: budget({ budget_min: Math.min(...maxes), budget_max: Math.max(...maxes) }) }) : t(`${P}.fixes.budgetOk`),
      end: <Chip tone={f.budget.length ? 'neutral' : 'good'}>{f.budget.length}</Chip> },
    { key: 'noAgent', sub: f.noAgent.length ? names(f.noAgent) : t(`${P}.fixes.noAgentOk`), end: <Chip tone={f.noAgent.length ? 'warn' : 'good'}>{f.noAgent.length}</Chip> },
  ]
  return (
    <>
      <Figure value={f.total}>{t(`${P}.fixes.figure`, { count: f.total })}</Figure>
      <MiniList label={t(`${P}.fixes.title`)} items={items.map((it) => ({ ...it, title: t(`${P}.fixes.kinds.${it.key}`) }))} />
    </>
  )
}

export function FixesDetail({ f, onOpen, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const budget = useBudget()
  const why = {
    dups: (d) => t(`${P}.fixes.why.dups`, { status: t(`crm.shared.status.${d.client.status}`, { defaultValue: d.client.status }), visits: d.visits.length, tx: d.tx.length }),
    inactive: (d) => (d.txActive.length
      ? t(`${P}.fixes.why.inactiveTx`, { count: d.txActive.length })
      : t(`${P}.fixes.why.inactiveVisit`, { date: fmtDate(d.honored.at(-1)?.scheduled_at, { day: 'numeric', month: 'short' }) })),
    budget: (d) => t(`${P}.fixes.why.budget`, { budget: budget(d.client) }),
    noAgent: () => t(`${P}.fixes.why.noAgent`),
  }
  const groups = ['dups', 'inactive', 'budget', 'noAgent'].filter((k) => f[k].length)
  return (
    <DetailFrame title={t(`${P}.fixes.title`)} sub={t(`${P}.fixes.detailSub`, { count: f.total })} onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!groups.length ? <p className="text-sm text-gray-500">{t(`${P}.fixes.none`)}</p> : (
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>
              <th className={`${TH} max-sm:hidden`}>{t(`${P}.cols.problem`)}</th>
              <th className={TH}>{t(`${P}.cols.client`)}</th>
              <th className={TH}>{t(`${P}.cols.finding`)}</th>
              <th className={TH}><span className="sr-only">{t(`${P}.cols.actions`)}</span></th>
            </tr></thead>
            <tbody>{groups.flatMap((k) => f[k].map((d, i) => (
              <tr key={`${k}-${d.id}`} className="hover:bg-gray-50">
                <td className={`${TD} max-sm:hidden`}>{i === 0 && <b className="font-semibold">{t(`${P}.fixes.kinds.${k}`)}</b>}</td>
                <td className={TD}><ClientCell d={d} /></td>
                <td className={TD}>{why[k](d)}</td>
                <td className={`${TD} text-end`}><OpenAction d={d} onOpen={onOpen} /></td>
              </tr>
            )))}</tbody>
          </table>
        )}
        aside={<>
          {f.noAgent.length
            ? <Alert tone="warn" icon={FiUser}><Rich i18nKey={`${P}.fixes.noAgentAlert`} values={{ count: f.noAgent.length, names: names(f.noAgent) }} /></Alert>
            : <Alert tone="plain" icon={FiCheck}><Rich i18nKey={`${P}.fixes.allAssigned`} /></Alert>}
          {f.pairs > 0 && <Alert tone="warn" icon={FiUsers}><Rich i18nKey={`${P}.fixes.dupAlert`} values={{ count: f.pairs }} /></Alert>}
          <p className={note}>{t(`${P}.fixes.note`)}</p>
        </>}
      />
    </DetailFrame>
  )
}
