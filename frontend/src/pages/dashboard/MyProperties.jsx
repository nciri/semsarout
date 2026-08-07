import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiEdit2, FiTrash2, FiEye, FiHeart, FiUploadCloud } from 'react-icons/fi'
import { propertyService } from '../../services/propertyService'
import { buyerService } from '../../services/buyerService'
import { formatPrice } from '../../utils/currency'
import MesBiensTabs from '../../components/dashboard/MesBiensTabs'

function MyProperties() {
  const { t } = useTranslation(['dashboard', 'common'])
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [deleteId, setDeleteId] = useState(null)

  // Deux onglets : les annonces en vente et celles en location
  const transactionType = searchParams.get('transaction_type') === 'rent' ? 'rent' : 'sale'
  const status = searchParams.get('status') || ''
  const favoris = searchParams.get('favoris') === '1'
  const page = parseInt(searchParams.get('page') || '1')

  const { data, isLoading } = useQuery(
    ['my-properties', { status, transactionType, page }],
    () => propertyService.getMyProperties({ status, transaction_type: transactionType, page, per_page: 10 }),
    { enabled: !favoris }
  )

  // Favoris (mêmes données que le cœur des cartes) filtrés par onglet
  const { data: favData, isLoading: favLoading } = useQuery(
    ['favorites'],
    () => buyerService.getFavorites({ per_page: 100 }),
    { enabled: favoris }
  )
  const favoriteProperties = (favData?.favorites || [])
    .filter(f => f.property && f.property.transaction_type === transactionType)
    .map(f => ({ ...f.property, favoriteId: f.id }))

  const rows = favoris ? favoriteProperties : (data?.properties || [])
  const loading = favoris ? favLoading : isLoading
  const totalCount = favoris ? favoriteProperties.length : (data?.total || 0)

  // Statuts pertinents selon l'onglet (Vendues pour la vente, Louées pour la location)
  const statusFilters = [
    { value: '', label: t('dashboard:myProperties.statusFilters.all') },
    { value: 'active', label: t('dashboard:myProperties.statusFilters.active') },
    { value: 'draft', label: t('dashboard:myProperties.statusFilters.draft') },
    transactionType === 'sale'
      ? { value: 'sold', label: t('dashboard:myProperties.statusFilters.sold') }
      : { value: 'rented', label: t('dashboard:myProperties.statusFilters.rented') }
  ]

  const setStatus = (value) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('transaction_type', transactionType)
    newParams.delete('favoris')
    if (value) {
      newParams.set('status', value)
    } else {
      newParams.delete('status')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const toggleFavoris = () => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('transaction_type', transactionType)
    if (favoris) {
      newParams.delete('favoris')
    } else {
      newParams.set('favoris', '1')
      newParams.delete('status')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const deleteMutation = useMutation(
    (id) => propertyService.deleteProperty(id),
    {
      onSuccess: () => {
        toast.success(t('dashboard:myProperties.toasts.deleted'))
        queryClient.invalidateQueries('my-properties')
        setDeleteId(null)
      },
      onError: () => {
        toast.error(t('dashboard:myProperties.toasts.deleteError'))
      }
    }
  )

  const removeFavMutation = useMutation(
    (favId) => buyerService.removeFavorite(favId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['favorites'])
        toast.success(t('dashboard:myProperties.toasts.favRemoved'))
      },
      onError: () => toast.error(t('common:errors.generic'))
    }
  )

  const publishMutation = useMutation(
    (id) => propertyService.publishProperty(id),
    {
      onSuccess: () => {
        toast.success(t('dashboard:myProperties.toasts.published'))
        queryClient.invalidateQueries('my-properties')
      },
      onError: () => {
        toast.error(t('dashboard:myProperties.toasts.publishError'))
      }
    }
  )

  const STATUS_LABELS = {
    draft: { label: t('dashboard:myProperties.status.draft'), class: 'bg-gray-100 text-gray-600' },
    active: { label: t('dashboard:myProperties.status.active'), class: 'badge-success' },
    pending: { label: t('dashboard:myProperties.status.pending'), class: 'badge-warning' },
    sold: { label: t('dashboard:myProperties.status.sold'), class: 'bg-blue-100 text-blue-800' },
    rented: { label: t('dashboard:myProperties.status.rented'), class: 'bg-blue-100 text-blue-800' },
    archived: { label: t('dashboard:myProperties.status.archived'), class: 'bg-gray-100 text-gray-600' }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-900">{t('dashboard:myProperties.title')}</h1>
        <p className="text-gray-600">
          {favoris
            ? t('dashboard:myProperties.favoritesCount', { count: totalCount })
            : t('dashboard:myProperties.totalCount', { count: totalCount })}
        </p>
      </div>

      {/* Onglets : en vente / en location / programmes immobiliers */}
      <MesBiensTabs />

      {/* Filtre par statut (propre à l'onglet) + favoris */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {statusFilters.map(filter => (
          <button
            key={filter.value}
            onClick={() => setStatus(filter.value)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
              !favoris && status === filter.value
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
        <div className="w-px bg-gray-200 mx-1 self-stretch" />
        <button
          onClick={toggleFavoris}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap inline-flex items-center gap-1.5 ${
            favoris ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FiHeart className={`w-4 h-4 ${favoris ? 'fill-current' : ''}`} /> {t('dashboard:myProperties.favorites')}
        </button>
      </div>

      {/* Properties Table */}
      {loading ? (
        <div className="card">
          <div className="animate-pulse p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      ) : rows.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-start px-6 py-4 text-sm font-medium text-gray-500">{t('dashboard:myProperties.columns.listing')}</th>
                  <th className="text-start px-6 py-4 text-sm font-medium text-gray-500">{t('dashboard:myProperties.columns.price')}</th>
                  <th className="text-start px-6 py-4 text-sm font-medium text-gray-500">{t('dashboard:myProperties.columns.status')}</th>
                  <th className="text-start px-6 py-4 text-sm font-medium text-gray-500">{t('dashboard:myProperties.columns.views')}</th>
                  <th className="text-start px-6 py-4 text-sm font-medium text-gray-500">{t('dashboard:myProperties.columns.contacts')}</th>
                  <th className="text-start px-6 py-4 text-sm font-medium text-gray-500">{t('dashboard:myProperties.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(property => (
                  <tr key={property.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{property.title}</p>
                        <p className="text-sm text-gray-500">{property.city} - {property.reference}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium">{formatPrice(property.price)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge ${STATUS_LABELS[property.status]?.class || 'bg-gray-100'}`}>
                        {STATUS_LABELS[property.status]?.label || property.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{property.views_count}</td>
                    <td className="px-6 py-4 text-gray-600">{property.contacts_count}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-start gap-2">
                        <Link
                          to={`/annonces/${property.id}`}
                          className="p-2 text-gray-400 hover:text-gray-600"
                          title={t('dashboard:myProperties.actions.view')}
                        >
                          <FiEye className="w-4 h-4" />
                        </Link>
                        {favoris ? (
                          <button
                            onClick={() => removeFavMutation.mutate(property.favoriteId)}
                            className="p-2 text-red-500 hover:text-red-700"
                            title={t('dashboard:myProperties.actions.removeFavorite')}
                          >
                            <FiHeart className="w-4 h-4 fill-current" />
                          </button>
                        ) : (
                          <>
                            <Link
                              to={`/dashboard/annonces/${property.id}/modifier`}
                              className="p-2 text-gray-400 hover:text-gray-600"
                              title={t('dashboard:myProperties.actions.edit')}
                            >
                              <FiEdit2 className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => setDeleteId(property.id)}
                              className="p-2 text-gray-400 hover:text-red-600"
                              title={t('dashboard:shared.actions.delete')}
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                            {property.status === 'draft' && (
                              <button
                                onClick={() => publishMutation.mutate(property.id)}
                                disabled={publishMutation.isLoading}
                                className="p-2 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded disabled:opacity-50"
                                title={t('dashboard:myProperties.actions.publish')}
                              >
                                <FiUploadCloud className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-12 text-center">
          {favoris ? (
            <p className="text-gray-500">
              {t('dashboard:myProperties.emptyFavorites')}
            </p>
          ) : (
            <>
              <p className="text-gray-500 mb-4">{t('dashboard:myProperties.empty')}</p>
              <Link to="/dashboard/annonces/nouvelle" className="btn-primary">
                {t('dashboard:myProperties.createFirst')}
              </Link>
            </>
          )}
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-semibold text-lg mb-2">{t('dashboard:myProperties.deleteModal.title')}</h3>
            <p className="text-gray-600 mb-6">
              {t('dashboard:myProperties.deleteModal.message')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="btn-secondary"
              >
                {t('dashboard:shared.actions.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isLoading}
              >
                {deleteMutation.isLoading ? t('dashboard:shared.actions.deleting') : t('dashboard:shared.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyProperties
