import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiX, FiBarChart2 } from 'react-icons/fi'
import useCompareStore, { MAX_COMPARE_PROPERTIES } from '../../store/compareStore'

function CompareBar() {
  const { t } = useTranslation(['common'])
  const { propertyIds, remove, clear } = useCompareStore()

  if (propertyIds.length === 0) return null

  return (
    <div className="fixed bottom-0 start-0 end-0 z-40 bg-midnight text-white shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FiBarChart2 className="w-5 h-5 text-primary-400 shrink-0" />
          <span className="text-sm">
            {t('common:compareBar.selectedCount', { count: propertyIds.length })}
            <span className="text-ivory/50">{t('common:compareBar.max', { count: MAX_COMPARE_PROPERTIES })}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={clear} className="text-sm text-ivory/70 hover:text-white">
            {t('common:compareBar.clear')}
          </button>
          <Link
            to={`/comparer?ids=${propertyIds.join(',')}`}
            className="btn-primary text-sm py-2"
          >
            {t('common:compareBar.compare')}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default CompareBar
