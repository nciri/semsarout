import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useChartTheme } from './palette'

function BarsChart({ data, xKey, bars, height = 260 }) {
  const { series, grid } = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey={xKey} stroke="currentColor" fontSize={12} />
        <YAxis stroke="currentColor" fontSize={12} width={60} />
        <Tooltip />
        {bars.length > 1 && <Legend />}
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={series[i % series.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export default BarsChart
