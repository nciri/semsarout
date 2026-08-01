import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useChartTheme } from './palette'

function TrendLine({ data, xKey, lines, height = 260 }) {
  const { series, grid } = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey={xKey} stroke="currentColor" fontSize={12} />
        <YAxis stroke="currentColor" fontSize={12} width={60} />
        <Tooltip />
        {lines.length > 1 && <Legend />}
        {lines.map((l, i) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name}
            stroke={series[i % series.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export default TrendLine
