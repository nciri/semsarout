import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDh } from './useShop'

export const PAID = '#009683'
export const PENDING = '#3366CC'

/** Barres horizontales empilées réglé / en attente, une par catégorie ; infobulle au survol et au focus. */
export default function SpendChart({ rows, labelOf }) {
  const { t } = useTranslation('backoffice')
  const dh = useDh()
  const box = useRef(null)
  const [W, setW] = useState(560)
  const [tip, setTip] = useState(null)

  // Mesurée plutôt que mise à l'échelle : sur mobile, un viewBox fixe rendait le texte illisible.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const narrow = W < 460
  const H = Math.max(120, rows.length * 44 + 32)
  const L = narrow ? 104 : 150
  const R = 78
  const T = 8
  const B = 24
  const rawMax = Math.max(1, ...rows.map((r) => r.paid + r.pending))
  const step = rawMax > 20000 ? 10000 : rawMax > 8000 ? 4000 : rawMax > 2000 ? 1000 : 500
  const max = Math.ceil(rawMax / step) * step
  const x = (v) => L + ((W - L - R) * v) / max
  const band = (H - T - B) / Math.max(1, rows.length)
  const bh = Math.min(22, band * 0.6)
  const ticks = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  const room = narrow ? 14 : 22
  const short = (s) => (s.length > room ? `${s.slice(0, room - 1)}…` : s)

  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('shop.spend.chartLabel')} className="block h-auto w-full overflow-visible">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={T} y2={H - B} stroke="#EEEAE3" />
            <text x={x(v)} y={H - 6} textAnchor="middle" className="fill-gray-500 text-[11px]">
              {v >= 1000 ? `${v / 1000} k` : v}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = T + band * i + band / 2
          const y = cy - bh / 2
          const label = labelOf(r)
          const show = (e) => setTip({ r, label, x: e.clientX, y: e.clientY })
          const segs = [[r.paid, PAID], [r.pending, PENDING]].filter(([v]) => v > 0)
          let x0 = L
          return (
            <g key={r.key} tabIndex={0} aria-label={t('shop.spend.barLabel', { label, paid: dh(r.paid), pending: dh(r.pending) })}
              onMouseMove={show} onMouseLeave={() => setTip(null)}
              onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ r, label, x: b.left + b.width / 2, y: b.top }) }}
              onBlur={() => setTip(null)} className="outline-none [&:focus_.hit]:fill-gray-100 [&:hover_.hit]:fill-gray-100">
              <rect className="hit" x={4} y={cy - band / 2 + 2} width={W - 8} height={band - 4} rx={6} fill="transparent" />
              <text x={L - 10} y={cy + 4} textAnchor="end" className="fill-gray-900 text-[12px]">{short(label)}</text>
              {segs.map(([v, c], k) => {
                const w = x(v) - L
                const last = k === segs.length - 1
                const el = last
                  ? <path key={c} d={`M${x0},${y} H${x0 + w - 4} Q${x0 + w},${y} ${x0 + w},${y + 4} V${y + bh - 4} Q${x0 + w},${y + bh} ${x0 + w - 4},${y + bh} H${x0} Z`} fill={c} />
                  : <rect key={c} x={x0} y={y} width={Math.max(0, w - 2)} height={bh} fill={c} />
                x0 += w
                return el
              })}
              <text x={x(r.paid + r.pending) + 8} y={cy + 4} className="fill-gray-900 text-[11px] font-semibold">{dh(r.paid + r.pending)}</text>
            </g>
          )
        })}
      </svg>
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-40 min-w-[160px] rounded-lg bg-gray-900 px-2.5 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 190)), top: Math.max(8, tip.y - 80) }}>
          <b className="mb-1 block">{tip.label}</b>
          {[['paid', PAID, tip.r.paid], ['pending', PENDING, tip.r.pending]].map(([k, c, v]) => (
            <div key={k} className="flex justify-between gap-3.5 tabular-nums">
              <span><i className="me-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{t(`shop.spend.${k}`)}</span>
              <span>{dh(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
