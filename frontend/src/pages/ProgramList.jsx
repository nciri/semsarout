import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import {
  FiSearch, FiFilter, FiMapPin, FiCalendar, FiHome, FiGrid, FiList,
  FiCheckCircle, FiClock, FiAlertCircle, FiChevronDown
} from 'react-icons/fi'
import { DIRHAM_SYMBOL, formatPrice } from '../utils/currency'

const programsService = {
  getPrograms: async (params) => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.append(key, value)
    })
    const response = await fetch(`/api/v1/programs?${searchParams}`)
    if (!response.ok) throw new Error('Failed to fetch programs')
    return response.json()
  }
}

const CONSTRUCTION_STATUS = {
  planning: { label: 'En projet', icon: FiClock, color: 'text-gray-500 bg-gray-100' },
  under_construction: { label: 'En construction', icon: FiAlertCircle, color: 'text-orange-500 bg-orange-100' },
  delivered: { label: 'Livré', icon: FiCheckCircle, color: 'text-green-500 bg-green-100' }
}

const PROGRAM_TYPES = [
  { value: '', label: 'Tous les types' },
  { value: 'residential', label: 'Résidentiel' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed', label: 'Mixte' }
]

const MOROCCAN_CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Oujda',
  'Kenitra', 'Tétouan', 'El Jadida', 'Mohammedia', 'Salé', 'Meknès'
]

function ProgramCard({ program }) {
  const constructionStatus = CONSTRUCTION_STATUS[program.construction_status] || CONSTRUCTION_STATUS.planning
  const ConstructionIcon = constructionStatus.icon

  return (
    <Link
      to={`/programmes/${program.slug}`}
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group"
    >
      <div className="aspect-video bg-gray-200 relative overflow-hidden">
        {program.cover_image_url ? (
          <img
            src={program.cover_image_url}
            alt={program.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
            <FiHome className="w-16 h-16 text-primary-400" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${constructionStatus.color}`}>
            <ConstructionIcon className="w-3.5 h-3.5" />
            {constructionStatus.label}
          </span>
        </div>
        {program.delivery_date && (
          <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
            <FiCalendar className="w-3 h-3" />
            Livraison {new Date(program.delivery_date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-lg text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-1">
          {program.name}
        </h3>
        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
          <FiMapPin className="w-4 h-4" />
          {program.city}{program.neighborhood && `, ${program.neighborhood}`}
        </p>

        {program.description && (
          <p className="text-sm text-gray-600 mt-3 line-clamp-2">
            {program.description}
          </p>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              {program.min_price ? (
                <>
                  <p className="text-xs text-gray-500">À partir de</p>
                  <p className="text-xl font-bold text-primary-600">
                    {formatPrice(program.min_price)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Prix sur demande</p>
              )}
            </div>
            {program.available_units > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Disponibles</p>
                <p className="text-lg font-semibold text-gray-900">
                  {program.available_units} unités
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function ProgramList() {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    city: '',
    type: '',
    construction_status: '',
    min_price: '',
    max_price: '',
    page: 1
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery(
    ['public-programs', filters, search],
    () => programsService.getPrograms({ ...filters, q: search }),
    { keepPreviousData: true }
  )

  const handleSearch = (e) => {
    e.preventDefault()
    setFilters({ ...filters, page: 1 })
  }

  const resetFilters = () => {
    setFilters({
      city: '',
      type: '',
      construction_status: '',
      min_price: '',
      max_price: '',
      page: 1
    })
    setSearch('')
  }

  const activeFiltersCount = [
    filters.city,
    filters.type,
    filters.construction_status,
    filters.min_price,
    filters.max_price
  ].filter(Boolean).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Programmes immobiliers neufs
          </h1>
          <p className="text-lg text-primary-100 mb-8 max-w-2xl">
            Découvrez les projets immobiliers neufs au Maroc. Appartements, villas et résidences de standing.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl">
            <div className="flex-1 relative">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un programme, une ville..."
                className="w-full pl-12 pr-4 py-4 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-4 bg-white text-primary-600 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
            >
              Rechercher
            </button>
          </form>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filters.city}
              onChange={(e) => setFilters({ ...filters, city: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Toutes les villes</option>
              {MOROCCAN_CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>

            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PROGRAM_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            <select
              value={filters.construction_status}
              onChange={(e) => setFilters({ ...filters, construction_status: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">État de construction</option>
              {Object.entries(CONSTRUCTION_STATUS).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors ${
                showFilters || activeFiltersCount > 0
                  ? 'border-primary-500 text-primary-600 bg-primary-50'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FiFilter className="w-4 h-4" />
              Plus de filtres
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 bg-primary-600 text-white text-xs rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
              <FiChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Réinitialiser
              </button>
            )}

            <div className="ml-auto text-sm text-gray-500">
              {data?.total || 0} programme{(data?.total || 0) !== 1 ? 's' : ''} trouvé{(data?.total || 0) !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Extended filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix min ({DIRHAM_SYMBOL})</label>
                <input
                  type="number"
                  value={filters.min_price}
                  onChange={(e) => setFilters({ ...filters, min_price: e.target.value, page: 1 })}
                  placeholder="Ex: 500000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix max ({DIRHAM_SYMBOL})</label>
                <input
                  type="number"
                  value={filters.max_price}
                  onChange={(e) => setFilters({ ...filters, max_price: e.target.value, page: 1 })}
                  placeholder="Ex: 2000000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Programs grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-video bg-gray-200"></div>
                <div className="p-5">
                  <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                </div>
              </div>
            ))}
          </div>
        ) : data?.programs?.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.programs.map(program => (
                <ProgramCard key={program.id} program={program} />
              ))}
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
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
            <FiHome className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Aucun programme trouvé</h3>
            <p className="text-gray-500 mb-4">
              {search || activeFiltersCount > 0
                ? 'Aucun programme ne correspond à vos critères de recherche.'
                : 'Aucun programme immobilier n\'est disponible pour le moment.'}
            </p>
            {(search || activeFiltersCount > 0) && (
              <button
                onClick={resetFilters}
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
