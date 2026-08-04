function KpiTile({ label, value, sub, tone = 'default' }) {
  const toneCls = {
    default: 'text-gray-900',
    up: 'text-emerald-600',
    down: 'text-redcard-600',
  }[tone] || 'text-gray-900'

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="text-sm text-gray-600">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

export default KpiTile
