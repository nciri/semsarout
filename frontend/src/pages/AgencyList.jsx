import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { FiMapPin, FiHome, FiSearch, FiChevronLeft, FiChevronRight, FiMap, FiGrid, FiList } from 'react-icons/fi'
import { agencyService } from '../services/agencyService'
import AgencyMap from '../components/map/AgencyMap'

const MOROCCAN_CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger',
  'Agadir', 'Meknès', 'Oujda', 'Kenitra', 'Tétouan'
]

const VIEW_MODES = {
  GRID: 'grid',
  MAP: 'map',
  SPLIT: 'split'
}

function AgencyList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [viewMode, setViewMode] = useState(VIEW_MODES.GRID)
  const [selectedAgency, setSelectedAgency] = useState(null)

  const page = parseInt(searchParams.get('page') || '1')
  const city = searchParams.get('city') || ''

  const { data, isLoading } = useQuery(
    ['agencies', { page, city, q: searchParams.get('q') }],
    () => agencyService.getAgencies({ page, per_page: 50, city, q: searchParams.get('q') })
  )

  const handleSearch = (e) => {
    e.preventDefault()
    const newParams = new URLSearchParams(searchParams)
    if (search) {
      newParams.set('q', search)
    } else {
      newParams.delete('q')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const handleCityFilter = (selectedCity) => {
    const newParams = new URLSearchParams(searchParams)
    if (selectedCity) {
      newParams.set('city', selectedCity)
    } else {
      newParams.delete('city')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }

  const goToPage = (newPage) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', newPage.toString())
    setSearchParams(newParams)
    window.scrollTo(0, 0)
  }

  const handleMarkerClick = (agency) => {
    setSelectedAgency(agency)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-gray-900">
                Agences immobilières au Maroc
              </h1>
              <p className="text-gray-600">
                {data?.total || 0} agences vérifiées
              </p>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-2">
              <div className="bg-gray-100 rounded-lg p-1 flex">
                <button
                  onClick={() => setViewMode(VIEW_MODES.GRID)}
                  className={`p-2 rounded transition-colors ${
                    viewMode === VIEW_MODES.GRID
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Vue liste"
                >
                  <FiGrid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode(VIEW_MODES.MAP)}
                  className={`p-2 rounded transition-colors ${
                    viewMode === VIEW_MODES.MAP
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Vue carte"
                >
                  <FiMap className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode(VIEW_MODES.SPLIT)}
                  className={`p-2 rounded transition-colors hidden lg:block ${
                    viewMode === VIEW_MODES.SPLIT
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Vue mixte"
                >
                  <FiList className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex gap-2 flex-grow max-w-md">
              <div className="relative flex-grow">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une agence..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <button type="submit" className="btn-primary px-4">
                <FiSearch className="w-4 h-4" />
              </button>
            </form>

            {/* City filter chips */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleCityFilter('')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  !city
                    ? 'bg-terracotta-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Toutes
              </button>
              {MOROCCAN_CITIES.slice(0, 5).map(c => (
                <button
                  key={c}
                  onClick={() => handleCityFilter(c)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    city === c
                      ? 'bg-terracotta-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {c}
                </button>
              ))}
              <select
                value={MOROCCAN_CITIES.slice(5).includes(city) ? city : ''}
                onChange={(e) => handleCityFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 border-0 focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Autres villes</option>
                {MOROCCAN_CITIES.slice(5).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
                <div className="flex items-center mb-4">
                  <div className="w-16 h-16 bg-gray-200 rounded-lg mr-4"></div>
                  <div className="flex-grow">
                    <div className="h-5 bg-gray-200 rounded w-2/3 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Map View */}
            {viewMode === VIEW_MODES.MAP && (
              <AgencyMap
                agencies={data?.agencies || []}
                selectedId={selectedAgency?.id}
                onMarkerClick={handleMarkerClick}
                className="h-[calc(100vh-280px)] min-h-[500px]"
              />
            )}

            {/* Split View */}
            {viewMode === VIEW_MODES.SPLIT && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* List side */}
                <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                  {data?.agencies?.map(agency => (
                    <div
                      key={agency.id}
                      onClick={() => setSelectedAgency(agency)}
                      className={`bg-white rounded-xl p-4 cursor-pointer transition-all ${
                        selectedAgency?.id === agency.id
                          ? 'ring-2 ring-terracotta-500 shadow-md'
                          : 'hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center">
                        {agency.logo_url ? (
                          <img
                            src={agency.logo_url}
                            alt={agency.name}
                            className="w-14 h-14 rounded-lg object-cover mr-4"
                          />
                        ) : (
                          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-terracotta-500 rounded-lg flex items-center justify-center mr-4">
                            <span className="text-xl font-bold text-white">
                              {agency.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <div className="flex-grow">
                          <h3 className="font-semibold text-gray-900">{agency.name}</h3>
                          <div className="flex items-center text-gray-500 text-sm">
                            <FiMapPin className="w-3 h-3 mr-1" />
                            <span>{agency.city}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {agency.properties_count} annonces
                          </div>
                          {agency.is_verified && (
                            <span className="text-xs text-green-600">Vérifié</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Map side */}
                <div className="h-[calc(100vh-280px)] min-h-[500px]">
                  <AgencyMap
                    agencies={data?.agencies || []}
                    selectedId={selectedAgency?.id}
                    onMarkerClick={handleMarkerClick}
                    className="h-full"
                  />
                </div>
              </div>
            )}

            {/* Grid View */}
            {viewMode === VIEW_MODES.GRID && (
              <>
                {data?.agencies?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {data.agencies.map(agency => (
                      <Link
                        key={agency.id}
                        to={`/agences/${agency.slug}`}
                        className="bg-white rounded-xl hover:shadow-md transition-shadow"
                      >
                        <div className="p-6">
                          <div className="flex items-center mb-4">
                            {agency.logo_url ? (
                              <img
                                src={agency.logo_url}
                                alt={agency.name}
                                className="w-16 h-16 rounded-lg object-cover mr-4"
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-terracotta-500 rounded-lg flex items-center justify-center mr-4">
                                <span className="text-2xl font-bold text-white">
                                  {agency.name.charAt(0)}
                                </span>
                              </div>
                            )}
                            <div>
                              <h3 className="font-semibold text-gray-900">{agency.name}</h3>
                              <div className="flex items-center text-gray-500 text-sm">
                                <FiMapPin className="w-3 h-3 mr-1" />
                                <span>{agency.city}</span>
                              </div>
                            </div>
                          </div>

                          {agency.description && (
                            <p className="text-gray-600 text-sm line-clamp-2 mb-4">
                              {agency.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center text-gray-500">
                              <FiHome className="w-4 h-4 mr-1" />
                              <span>{agency.properties_count} annonces</span>
                            </div>
                            {agency.is_verified && (
                              <span className="badge-success">Vérifiée</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FiMapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Aucune agence trouvée.</p>
                  </div>
                )}

                {/* Pagination */}
                {data?.pages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-8">
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={page === 1}
                      className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FiChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">Précédent</span>
                    </button>

                    <span className="px-4 py-2 text-sm text-gray-600">
                      Page {page} sur {data.pages}
                    </span>

                    <button
                      onClick={() => goToPage(page + 1)}
                      disabled={page === data.pages}
                      className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="hidden sm:inline">Suivant</span>
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default AgencyList
