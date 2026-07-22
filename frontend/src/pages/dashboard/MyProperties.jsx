import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiEdit2, FiTrash2, FiEye, FiMoreVertical, FiHeart } from 'react-icons/fi'
import { propertyService } from '../../services/propertyService'
import { buyerService } from '../../services/buyerService'
import { formatPrice } from '../../utils/currency'
import MesBiensTabs from '../../components/dashboard/MesBiensTabs'

function MyProperties() {
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
    { value: '', label: 'Tous statuts' },
    { value: 'active', label: 'Actives' },
    { value: 'draft', label: 'Brouillons' },
    transactionType === 'sale'
      ? { value: 'sold', label: 'Vendues' }
      : { value: 'rented', label: 'Louées' }
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
        toast.success('Annonce supprimée')
        queryClient.invalidateQueries('my-properties')
        setDeleteId(null)
      },
      onError: () => {
        toast.error('Erreur lors de la suppression')
      }
    }
  )

  const removeFavMutation = useMutation(
    (favId) => buyerService.removeFavorite(favId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['favorites'])
        toast.success('Retiré des favoris')
      },
      onError: () => toast.error('Une erreur est survenue')
    }
  )

  const publishMutation = useMutation(
    (id) => propertyService.publishProperty(id),
    {
      onSuccess: () => {
        toast.success('Annonce publiée')
        queryClient.invalidateQueries('my-properties')
      },
      onError: () => {
        toast.error('Erreur lors de la publication')
      }
    }
  )

  const STATUS_LABELS = {
    draft: { label: 'Brouillon', class: 'bg-gray-100 text-gray-600' },
    active: { label: 'Active', class: 'badge-success' },
    pending: { label: 'En attente', class: 'badge-warning' },
    sold: { label: 'Vendu', class: 'bg-blue-100 text-blue-800' },
    rented: { label: 'Loué', class: 'bg-blue-100 text-blue-800' },
    archived: { label: 'Archivé', class: 'bg-gray-100 text-gray-600' }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-900">Mes annonces</h1>
        <p className="text-gray-600">
          {favoris
            ? `${totalCount} favori${totalCount > 1 ? 's' : ''}`
            : `${totalCount} annonces au total`}
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
          <FiHeart className={`w-4 h-4 ${favoris ? 'fill-current' : ''}`} /> Favoris
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
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Annonce</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Prix</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Statut</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Vues</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Contacts</th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
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
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/annonces/${property.id}`}
                          className="p-2 text-gray-400 hover:text-gray-600"
                          title="Voir"
                        >
                          <FiEye className="w-4 h-4" />
                        </Link>
                        {favoris ? (
                          <button
                            onClick={() => removeFavMutation.mutate(property.favoriteId)}
                            className="p-2 text-red-500 hover:text-red-700"
                            title="Retirer des favoris"
                          >
                            <FiHeart className="w-4 h-4 fill-current" />
                          </button>
                        ) : (
                          <>
                            <Link
                              to={`/dashboard/annonces/${property.id}/modifier`}
                              className="p-2 text-gray-400 hover:text-gray-600"
                              title="Modifier"
                            >
                              <FiEdit2 className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => setDeleteId(property.id)}
                              className="p-2 text-gray-400 hover:text-red-600"
                              title="Supprimer"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                            {property.status === 'draft' && (
                              <button
                                onClick={() => publishMutation.mutate(property.id)}
                                className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                              >
                                Publier
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
              Aucun favori pour cet onglet. Cliquez sur le ❤ d'une annonce pour l'enregistrer.
            </p>
          ) : (
            <>
              <p className="text-gray-500 mb-4">Aucune annonce trouvée</p>
              <Link to="/dashboard/annonces/nouvelle" className="btn-primary">
                Créer ma première annonce
              </Link>
            </>
          )}
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-semibold text-lg mb-2">Supprimer l'annonce ?</h3>
            <p className="text-gray-600 mb-6">
              Cette action est irréversible. L'annonce sera définitivement supprimée.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isLoading}
              >
                {deleteMutation.isLoading ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyProperties
