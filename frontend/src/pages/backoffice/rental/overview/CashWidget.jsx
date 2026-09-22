import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Chip, DetailFrame, Legend, TD, TH } from '../../components/kit'
import { chartTop, ratio } from '../model'
import { useRentalFormat } from '../hooks'

const S1 = '#009683'   // encaissé
const S2 = '#3366CC'   // reste dû

function CashChart({ months }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const [tip, setTip] = useState(null)
  const W = 620, H = 200, L = 44, R = 6, T = 20, B = 26
  const { top, step } = chartTop(months.map((m) => m.expected))
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const band = (W - L - R) / months.length
  const bw = Math.min(46, band * 0.5)
  const ticks = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  const short = (m) => f.month(m.year, m.month, { month: 'short' })
  const tick = (v) => (v >= 1000 ? `${f.n(v / 1000)} k` : f.n(v))

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('rental.overview.cash.chartLabel')} className="block h-auto w-full overflow-visible">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#EEEAE3" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-gray-500 text-[11px]">{tick(v)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = L + band * i + band / 2
          const x = cx - bw / 2
          const rest = Math.max(0, m.expected - m.collected)
          const y0 = y(0), y1 = y(m.collected), y2 = y(m.expected)
          const topSeg = (a, b, fill) => <path d={`M${x},${a} V${b + 4} Q${x},${b} ${x + 4},${b} H${x + bw - 4} Q${x + bw},${b} ${x + bw},${b + 4} V${a} Z`} fill={fill} />
          const show = (e) => setTip({ m, x: e.clientX, y: e.clientY })
          return (
            <g key={m.key} tabIndex={0}
              aria-label={t('rental.overview.cash.barLabel', { month: f.month(m.year, m.month), collected: f.dh(m.collected), expected: f.dh(m.expected) })}
              onMouseMove={show} onMouseLeave={() => setTip(null)}
              onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ m, x: r.left + r.width / 2, y: r.top }) }}
              onBlur={() => setTip(null)} className="outline-none [&:focus_.hit]:fill-gray-100 [&:hover_.hit]:fill-gray-100">
              <rect className="hit" x={cx - band / 2 + 2} y={T - 14} width={band - 4} height={H - B - T + 14} rx={6} fill="transparent" />
              {m.collected > 0 && (rest > 0
                ? <rect x={x} y={y1 + 2} width={bw} height={Math.max(0, y0 - y1 - 2)} fill={S1} />
                : topSeg(y0, y1, S1))}
              {rest > 0 && topSeg(y1, y2, S2)}
              {m.expected > 0 && <text x={cx} y={y2 - 6} textAnchor="middle" className="fill-gray-600 text-[11px] font-semibold">{f.pct(ratio(m.collected, m.expected))}</text>}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[11px] capitalize">{short(m)}</text>
            </g>
          )
        })}
      </svg>
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-40 min-w-[170px] rounded-lg bg-gray-900 px-2.5 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 200)), top: Math.max(8, tip.y - 100) }}>
          <b className="mb-1 block capitalize">{f.month(tip.m.year, tip.m.month)}</b>
          <div className="flex justify-between gap-3.5 tabular-nums"><span><i className="me-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: S1 }} />{t('rental.overview.cash.collected')}</span><span>{f.dh(tip.m.collected)}</span></div>
          <div className="flex justify-between gap-3.5 tabular-nums"><span><i className="me-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: S2 }} />{t('rental.overview.cash.rest')}</span><span>{f.dh(Math.max(0, tip.m.expected - tip.m.collected))}</span></div>
          <div className="mt-1 flex justify-between gap-3.5 font-semibold tabular-nums"><span>{t('rental.overview.cash.called', { count: tip.m.count })}</span><span>{f.dh(tip.m.expected)}</span></div>
        </div>
      )}
    </div>
  )
}

const hasData = (s) => s.collections.months.some((m) => m.expected > 0)

export function CashCompact({ s }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const months = s.collections.months
  if (!hasData(s)) return <p className="text-sm text-gray-500">{t('rental.overview.cash.empty')}</p>
  const first = months[0], last = months.at(-1)
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="text-[12.5px] text-gray-500">{t('rental.overview.cash.range', { from: f.month(first.year, first.month, { month: 'long' }), to: f.month(last.year, last.month) })}</span>
        <Legend items={[{ color: S1, label: t('rental.overview.cash.collected') }, { color: S2, label: t('rental.overview.cash.rest') }]} />
      </div>
      <CashChart months={months} />
    </div>
  )
}

export function CashDetail({ s, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const { months, by_lease: rows } = s.collections
  const first = months[0], last = months.at(-1)
  // Le taux ignore les échéances pas encore dues : elles ne sont pas en retard.
  const sum = (cells, k) => Object.values(cells).filter((c) => c.state !== 'upcoming').reduce((n, c) => n + (c[k] || 0), 0)
  const totalExp = months.reduce((n, m) => n + m.expected, 0)
  const totalGot = months.reduce((n, m) => n + m.collected, 0)

  return (
    <DetailFrame title={t('rental.overview.cash.detailTitle')}
      sub={t('rental.overview.cash.detailSub', { from: f.month(first.year, first.month, { month: 'long' }), to: f.month(last.year, last.month) })}
      onClose={onClose} titleRef={titleRef}>
      {!hasData(s) ? <p className="text-sm text-gray-500">{t('rental.overview.cash.empty')}</p> : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr>
                <th className={TH}>{t('rental.overview.cash.lease')}</th>
                {months.map((m) => <th key={m.key} className={`${TH} text-end capitalize`}>{f.month(m.year, m.month, { month: 'short' })}</th>)}
                <th className={`${TH} text-end`}>{t('rental.overview.cash.rate')}</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lease_id} className="hover:bg-gray-50">
                    <td className={TD}><b className="font-semibold">{r.tenant_name || r.reference}</b><span className="block text-xs text-gray-500">{r.property_title}</span></td>
                    {months.map((m) => {
                      const c = r.months[m.key]
                      return (
                        <td key={m.key} className={`${TD} text-end tabular-nums`}>
                          {!c ? <span className="text-gray-400">—</span>
                            : c.state === 'late' ? <Chip tone="crit">0</Chip>
                              : c.state === 'partial' ? <Chip tone="warn">{f.n(c.paid)}</Chip>
                                : c.state === 'upcoming' ? <span className="text-gray-400">{f.n(c.paid)}</span>
                                  : f.n(c.paid)}
                        </td>
                      )
                    })}
                    <td className={`${TD} text-end tabular-nums`}>{f.pct(ratio(sum(r.months, 'paid'), sum(r.months, 'total')))}</td>
                  </tr>
                ))}
                <tr>
                  <td className={TD}><b>{t('rental.overview.cash.total')}</b></td>
                  {months.map((m) => <td key={m.key} className={`${TD} text-end font-bold tabular-nums`}>{f.n(m.collected)}</td>)}
                  <td className={`${TD} text-end font-bold tabular-nums`}>{f.pct(ratio(totalGot, totalExp))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mb-0 mt-3 text-[12.5px] text-gray-500">{t('rental.overview.cash.note')}</p>
        </>
      )}
    </DetailFrame>
  )
}
