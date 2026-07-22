import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import {
  FiPlus, FiSearch, FiFilter, FiMoreVertical, FiEdit2, FiTrash2,
  FiEye, FiHome, FiMapPin, FiDollarSign, FiGrid, FiList
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import api from '../../services/api'

const backofficeService = {
  getProperties: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/properties?${searchParams}`)
    return data
  },
  deleteProperty: async (id) => {
    const { data } = await api.delete(`/backoffice/properties/${id}`)
    return data
  }
}

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  sold: 'bg-blue-100 text-blue-700',
  rented: 'bg-purple-100 text-purple-700',
  draft: 'bg-gray-100 text-gray-700'
}

const STATUS_LABELS = {
  active: 'En ligne',
  pending: 'En attente',
  sold: 'Vendu',
  rented: 'Loué',
  draft: 'Brouillon'
}

const PROPERTY_TYPES = {
  apartment: 'Appartement',
  house: 'Maison',
  villa: 'Villa',
  land: 'Terrain',
  commercial: 'Commercial',
  office: 'Bureau'
}

function PropertyCard({ property, onDelete, viewMode }) {
  const [menuOpen, setMenuOpen] = useState(false)

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-4 p-4 bg-white border-b border-gray-100 hover:bg-gray-50">
        <div className="w-20 h-20 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
          {property.images?.[0] ? (
            <img
              src={property.images[0].url}
              alt={property.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FiHome className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                to={`/backoffice/biens/${property.id}`}
                className="font-semibold text-gray-900 hover:text-primary-600 line-clamp-1"
              >
                {property.title}
              </Link>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <FiMapPin className="w-3 h-3" />
                {property.city}{property.neighborhood && `, ${property.neighborhood}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[property.status]}`}>
                {STATUS_LABELS[property.status]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-gray-600">{PROPERTY_TYPES[property.property_type]}</span>
            <span className="font-semibold text-gray-900">{formatPrice(property.price)}</span>
            {property.surface && <span className="text-gray-500">{property.surface} m²</span>}
            <span className="text-gray-400">{property.views_count || 0} vues</span>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <FiMoreVertical className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
              <Link
                to={`/annonces/${property.id}`}
                target="_blank"
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FiEye className="w-4 h-4" /> Voir en ligne
              </Link>
              <Link
                to={`/backoffice/biens/${property.id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FiEdit2 className="w-4 h-4" /> Modifier
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onDelete(property.id)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
              >
                <FiTrash2 className="w-4 h-4" /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-video bg-gray-200 relative">
        {property.images?.[0] ? (
          <img
            src={property.images[0].url}
            alt={property.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FiHome className="w-12 h-12 text-gray-400" />
          </div>
        )}
        <span className={`absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[property.status]}`}>
          {STATUS_LABELS[property.status]}
        </span>
        <div className="absolute top-2 right-2">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 bg-white/90 text-gray-600 hover:bg-white rounded-lg shadow"
          >
            <FiMoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
              <Link
                to={`/annonces/${property.id}`}
                target="_blank"
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FiEye className="w-4 h-4" /> Voir en ligne
              </Link>
              <Link
                to={`/backoffice/biens/${property.id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FiEdit2 className="w-4 h-4" /> Modifier
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onDelete(property.id)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
              >
                <FiTrash2 className="w-4 h-4" /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        <Link
          to={`/backoffice/biens/${property.id}`}
          className="font-semibold text-gray-900 hover:text-primary-600 line-clamp-1"
        >
          {property.title}
        </Link>
        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
          <FiMapPin className="w-3 h-3" />
          {property.city}{property.neighborhood && `, ${property.neighborhood}`}
        </p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-lg font-bold text-gray-900">{formatPrice(property.price)}</span>
          <span className="text-sm text-gray-500">{property.views_count || 0} vues</span>
        </div>
      </div>
    </div>
  )
}

export default function BackofficeProperties() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [filters, setFilters] = useState({
    status: '',
    property_type: '',
    page: 1
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery(
    ['backoffice-properties', filters, search],
    () => backofficeService.getProperties({ ...filters, q: search }),
    { keepPreviousData: true }
  )

  const deleteMutation = useMutation(backofficeService.deleteProperty, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-properties')
    }
  })

  const handleDelete = (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce bien ?')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biens immobiliers</h1>
          <p className="text-gray-500">Gérez votre portefeuille de biens</p>
        </div>
        <Link
          to="/backoffice/biens/nouveau"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <FiPlus className="w-5 h-5" />
          Ajouter un bien
        </Link>
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par titre, ville..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
                }`}
              >
                <FiGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
                }`}
              >
                <FiList className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                showFilters ? 'border-primary-500 text-primary-600 bg-primary-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FiFilter className="w-5 h-5" />
              Filtres
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Tous les statuts</option>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de bien</label>
              <select
                value={filters.property_type}
                onChange={(e) => setFilters({ ...filters, property_type: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Tous les types</option>
                {Object.entries(PROPERTY_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ status: '', property_type: '', page: 1 })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Properties */}
      {isLoading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'bg-white rounded-xl shadow-sm border border-gray-100'}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="aspect-video bg-gray-200 rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : data?.properties?.length > 0 ? (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.properties.map(property => (
                <PropertyCard key={property.id} property={property} onDelete={handleDelete} viewMode={viewMode} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {data.properties.map(property => (
                <PropertyCard key={property.id} property={property} onDelete={handleDelete} viewMode={viewMode} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page === 1}
                className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Précédent
              </button>
              <span className="text-gray-600">
                Page {filters.page} sur {data.pages}
              </span>
              <button
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page === data.pages}
                className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FiHome className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun bien trouvé</h3>
          <p className="text-gray-500 mb-4">
            {search || filters.status || filters.property_type
              ? 'Aucun bien ne correspond à vos critères.'
              : 'Commencez par ajouter votre premier bien.'}
          </p>
          <Link
            to="/backoffice/biens/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-5 h-5" />
            Ajouter un bien
          </Link>
        </div>
      )}
    </div>
  )
}
