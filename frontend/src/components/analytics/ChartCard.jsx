import { useTranslation } from 'react-i18next'

function ChartCard({ title, children, empty }) {
  const { t } = useTranslation(['backoffice'])
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      {title && <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>}
      {empty ? (
        <p className="text-sm text-gray-400 py-8 text-center">{t('backoffice:analytics.shared.noDataShort')}</p>
      ) : (
        <div className="w-full overflow-x-auto">{children}</div>
      )}
    </div>
  )
}

export default ChartCard
