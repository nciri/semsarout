// Inline SVG bar chart — no charting dependency. Horizontal bars scale against a shared
// axis so magnitudes stay comparable at a glance; ticks + value labels keep it readable
// without hovering, and role="img" + <title>/aria-label keep it accessible to screen readers.

const ROW_HEIGHT = 40
const BAR_HEIGHT = 18
const LEFT_LABEL_WIDTH = 150
const RIGHT_VALUE_WIDTH = 64
const TOP_PAD = 8
const AXIS_HEIGHT = 24
const CHART_WIDTH = 520

// data: [{ key, label, value, colorVar? }]
export function BarChart({ title, ariaLabel, data, formatValue = (v) => String(v) }) {
  const chartWidth = CHART_WIDTH - LEFT_LABEL_WIDTH - RIGHT_VALUE_WIDTH
  const maxValue = Math.max(1, ...data.map((d) => d.value))
  const plotHeight = data.length * ROW_HEIGHT
  const height = TOP_PAD + plotHeight + AXIS_HEIGHT
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxValue * f))

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <title>{title}</title>
      {ticks.map((tick, i) => {
        const x = LEFT_LABEL_WIDTH + (tick / maxValue) * chartWidth
        return (
          <g key={tick + i}>
            <line x1={x} y1={TOP_PAD} x2={x} y2={TOP_PAD + plotHeight} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={x} y={TOP_PAD + plotHeight + 16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {formatValue(tick)}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const y = TOP_PAD + i * ROW_HEIGHT
        const barWidth = maxValue > 0 ? (d.value / maxValue) * chartWidth : 0
        const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2
        return (
          <g key={d.key ?? d.label}>
            <text
              x={LEFT_LABEL_WIDTH - 10}
              y={barY + BAR_HEIGHT / 2 + 4}
              textAnchor="end"
              fontSize="12.5"
              fill="var(--text-body)"
            >
              {d.label}
            </text>
            <rect x={LEFT_LABEL_WIDTH} y={barY} width={chartWidth} height={BAR_HEIGHT} rx={4} fill="var(--gray-150)" />
            <rect
              x={LEFT_LABEL_WIDTH}
              y={barY}
              width={barWidth}
              height={BAR_HEIGHT}
              rx={4}
              fill={d.colorVar ?? 'var(--navy-600)'}
            />
            <text
              x={LEFT_LABEL_WIDTH + barWidth + 8}
              y={barY + BAR_HEIGHT / 2 + 4}
              fontSize="12.5"
              fontWeight="600"
              fill="var(--text-heading)"
            >
              {formatValue(d.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
