function ChartCard({ title, children, empty }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
      {title && <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>}
      {empty ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Aucune donnée</p>
      ) : (
        <div className="w-full overflow-x-auto">{children}</div>
      )}
    </div>
  )
}

export default ChartCard
