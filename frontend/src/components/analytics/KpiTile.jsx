function KpiTile({ label, value, sub, tone = 'default' }) {
  const toneCls = {
    default: 'text-gray-900 dark:text-gray-100',
    up: 'text-emerald-600 dark:text-emerald-400',
    down: 'text-redcard-600 dark:text-redcard-300',
  }[tone] || 'text-gray-900 dark:text-gray-100'

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default KpiTile
