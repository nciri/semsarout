import { useChartTheme } from './palette'

function FunnelBars({ stages }) {
  const { series } = useChartTheme()
  const max = Math.max(1, ...stages.map((s) => s.count))
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.stage}>
          <div className="flex justify-between text-sm mb-1 text-gray-700">
            <span>{s.stage}</span>
            <span className="font-medium text-gray-900">{s.count}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(s.count / max) * 100}%`, background: series[i % series.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default FunnelBars
