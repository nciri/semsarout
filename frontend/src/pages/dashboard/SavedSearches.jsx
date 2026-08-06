import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiTrash2, FiBell, FiBellOff, FiSearch, FiArrowRight } from 'react-icons/fi'
import { buyerService } from '../../services/buyerService'
import DirIcon from '../../components/common/DirIcon'

function criteriaToQueryString(criteria) {
  return new URLSearchParams(criteria).toString()
}

function criteriaSummary(criteria, t) {
  const parts = []
  if (criteria.city) parts.push(criteria.city)
  if (criteria.transaction_type) parts.push(criteria.transaction_type === 'sale' ? t('dashboard:savedSearches.sale') : t('dashboard:savedSearches.rent'))
  if (criteria.property_type) parts.push(criteria.property_type)
  if (criteria.min_price || criteria.max_price) {
    parts.push(`${criteria.min_price || '0'} - ${criteria.max_price || '∞'} Dh`)
  }
  return parts.join(' · ') || t('dashboard:savedSearches.anyProperty')
}

function SavedSearches() {
  const { t } = useTranslation(['dashboard', 'common'])
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery('saved-searches', () => buyerService.getSavedSearches())

  const deleteMutation = useMutation(
    (id) => buyerService.deleteSavedSearch(id),
    {
      onSuccess: () => {
        toast.success(t('dashboard:savedSearches.toasts.deleted'))
        queryClient.invalidateQueries('saved-searches')
      }
    }
  )

  const searches = data?.searches || []

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">{t('dashboard:savedSearches.title')}</h1>
        <p className="text-gray-600">
          {t('dashboard:savedSearches.subtitle')}
        </p>
      </div>

      {searches.length === 0 ? (
        <div className="card p-12 text-center">
          <FiSearch className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{t('dashboard:savedSearches.empty')}</p>
          <Link to="/annonces" className="btn-primary inline-flex">
            {t('dashboard:savedSearches.startSearch')}
            <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {searches.map((search) => (
            <div key={search.id} className="card p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">{search.name}</h3>
                  {search.notify_new_matches ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      <FiBell className="w-3 h-3" /> {t('dashboard:savedSearches.alertsActive')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      <FiBellOff className="w-3 h-3" /> {t('dashboard:savedSearches.alertsOff')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">{criteriaSummary(search.criteria || {}, t)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/annonces?${criteriaToQueryString(search.criteria || {})}`}
                  className="btn-secondary text-sm"
                >
                  {t('dashboard:savedSearches.viewResults')}
                </Link>
                <button
                  onClick={() => deleteMutation.mutate(search.id)}
                  className="p-2 text-gray-400 hover:text-red-600"
                  title={t('dashboard:savedSearches.deleteTooltip')}
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SavedSearches
