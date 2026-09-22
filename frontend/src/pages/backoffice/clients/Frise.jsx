import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormat } from '../../../utils/format'
import { isRtl } from '../../../i18n/rtl'
import { LANES, timeScale } from './model'

const LANE_H = 34
const TOP = 22

function Mark({ state, x, y, color }) {
  if (state === 'done') return <circle cx={x} cy={y} r="6" fill={color} stroke="#fff" strokeWidth="1.5" />
  if (state === 'todo') return <circle cx={x} cy={y} r="5.5" fill="#fff" stroke={color} strokeWidth="2" />
  return <rect x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${x} ${y})`} fill="#fff" stroke={color} strokeWidth="2" />
}

/**
 * Frise d'un client : quatre couloirs sur une même échelle de temps. `describe(e)` donne le
 * titre et le détail d'un événement, repris dans l'infobulle et le nom accessible du repère.
 */
export default function Frise({ events, now, label, describe }) {
  const { t, i18n } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const wrap = useRef(null)
  const [width, setWidth] = useState(640)
  const [tip, setTip] = useState(null)

  useEffect(() => {
    const measure = () => { if (wrap.current?.clientWidth) setWidth(Math.round(wrap.current.clientWidth)) }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [])

  const W = Math.max(300, width)
  const narrow = W < 480
  const L = narrow ? 82 : 96
  const R = 10
  const H = TOP + LANE_H * LANES.length + 24
  const { t0, t1, ticks, major } = timeScale(events, now)
  const rtl = isRtl(i18n.language)
  // En arabe, le temps s'écoule de droite à gauche : on miroite l'axe, pas les libellés.
  const pos = (d) => {
    const f = (d - t0) / (t1 - t0)
    return rtl ? W - L - (W - L - R) * f : L + (W - L - R) * f
  }
  const laneX = rtl ? W : 0
  const seen = {}
  const nowX = pos(now)

  const show = (e, x, y) => setTip({ ...describe(e), date: fmtDate(e.date, { day: 'numeric', month: 'long' }), x, y })

  return (
    <div ref={wrap} className="relative">
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible text-[11px]">
        {(narrow ? major : ticks).map((d) => (
          <g key={d.toISOString()}>
            <line x1={pos(d)} x2={pos(d)} y1={TOP} y2={TOP + LANE_H * LANES.length} stroke="#EEEAE3" />
            <text x={pos(d)} y={H - 6} textAnchor="middle" fill="#747B8A">{fmtDate(d, { day: 'numeric', month: 'short' })}</text>
          </g>
        ))}
        {LANES.map((l, i) => {
          const y = TOP + LANE_H * i + LANE_H / 2
          return (
            <g key={l.key}>
              <text x={laneX} y={y + 4} textAnchor="start" fill="#4A5262" fontSize="12" fontWeight="500">{t(`crm.clients.page.lanes.${l.key}`)}</text>
              <line x1={rtl ? R : L} x2={rtl ? W - L : W - R} y1={y} y2={y} stroke="#E7E3DC" />
            </g>
          )
        })}
        <line x1={nowX} x2={nowX} y1={TOP - 4} y2={TOP + LANE_H * LANES.length} stroke="#0B1220" strokeDasharray="3 3" />
        <text x={nowX} y={TOP - 10} textAnchor="middle" fill="#0B1220" fontWeight="600">{t('crm.clients.page.today')}</text>
        {events.map((e, n) => {
          const li = LANES.findIndex((l) => l.key === e.lane)
          const key = `${e.lane}${Math.round(pos(e.date) / 8)}`
          seen[key] = (seen[key] || 0) + 1
          const x = pos(e.date) + (seen[key] - 1) * 7 * (rtl ? -1 : 1)
          const y = TOP + LANE_H * li + LANE_H / 2
          const d = describe(e)
          return (
            <g
              key={n}
              tabIndex={0}
              aria-label={`${fmtDate(e.date, { day: 'numeric', month: 'long' })} : ${d.title}${d.detail ? `, ${d.detail}` : ''}`}
              className="cursor-default outline-none [&:focus>*]:stroke-gray-900 [&:hover>*]:stroke-gray-900"
              onMouseMove={(ev) => show(e, ev.clientX, ev.clientY)}
              onMouseLeave={() => setTip(null)}
              onFocus={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); show(e, r.left + r.width / 2, r.top) }}
              onBlur={() => setTip(null)}
            >
              <Mark state={e.state} x={x} y={y} color={LANES[li].color} />
            </g>
          )
        })}
      </svg>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-30 min-w-[160px] max-w-[260px] rounded-lg bg-gray-900 px-2.5 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.max(8, Math.min(tip.x + 14, (typeof innerWidth === 'number' ? innerWidth : 1024) - 270)), top: Math.max(8, tip.y - 76) }}
        >
          <b className="mb-0.5 block">{tip.date}</b>
          {tip.title}
          {tip.detail && <span className="block text-gray-300">{tip.detail}</span>}
          {tip.chip && <span className="block text-gray-300">{tip.chip}</span>}
        </div>
      )}
    </div>
  )
}

export function ShapesLegend() {
  const { t } = useTranslation('backoffice')
  const c = '#747B8A'
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-gray-500">
      <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill={c} /></svg>{t('crm.clients.page.shapes.done')}</span>
      <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke={c} strokeWidth="2" /></svg>{t('crm.clients.page.shapes.todo')}</span>
      <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill="none" stroke={c} strokeWidth="1.8" /></svg>{t('crm.clients.page.shapes.ko')}</span>
    </div>
  )
}
