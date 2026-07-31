import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import { toast } from 'react-toastify'
import {
  FiFilter, FiGrid, FiList, FiChevronLeft, FiChevronRight,
  FiMap, FiSliders, FiX, FiBell
} from 'react-icons/fi'
import { HiSparkles } from 'react-icons/hi2'
import PropertyCard from '../components/common/PropertyCard'
import AdvancedSearch from '../components/search/AdvancedSearch'
import PropertyMap from '../components/map/PropertyMap'
import CompareBar from '../components/common/CompareBar'
import { propertyService } from '../services/propertyService'
import { buyerService } from '../services/buyerService'
import useAuthStore from '../store/authStore'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'surface_desc', label: 'Surface décroissante' },
  { value: 'rooms_desc', label: 'Plus de pièces' }
]

const VIEW_MODES = {
  GRID: 'grid',
  LIST: 'list',
  MAP: 'map',
  SPLIT: 'split'
}

function PropertyList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState(VIEW_MODES.GRID)
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [savingSearch, setSavingSearch] = useState(false)
  const { isAuthenticated } = useAuthStore()

  const page = parseInt(searchParams.get('page') || '1')

  // Build filters from URL params
  const filters = {
    page,
    per_page: viewMode === VIEW_MODES.MAP || viewMode === VIEW_MODES.SPLIT ? 100 : 12,
    transaction_type: searchParams.get('transaction_type') || '',
    property_type: searchParams.get('property_type') || '',
    city: searchParams.get('city') || '',
    neighborhood: searchParams.get('neighborhood') || '',
    min_price: searchParams.get('min_price') || '',
    max_price: searchParams.get('max_price') || '',
    min_surface: searchParams.get('min_surface') || '',
    max_surface: searchParams.get('max_surface') || '',
    min_rooms: searchParams.get('min_rooms') || '',
    max_rooms: searchParams.get('max_rooms') || '',
    min_bedrooms: searchParams.get('min_bedrooms') || '',
    min_bathrooms: searchParams.get('min_bathrooms') || '',
    features: searchParams.get('features') || '',
    energy_class: searchParams.get('energy_class') || '',
    ground_floor: searchParams.get('ground_floor') || '',
    last_floor: searchParams.get('last_floor') || '',
    min_construction_year: searchParams.get('min_construction_year') || '',
    owner_type: searchParams.get('owner_type') || '',
    has_photos: searchParams.get('has_photos') || '',
    is_featured: searchParams.get('is_featured') || '',
    sort: searchParams.get('sort') || 'newest',
    q: searchParams.get('q') || '',
    ai_query: searchParams.get('ai_query') || ''
  }

  const { data, isLoading, error } = useQuery(
    ['properties', filters],
    () => propertyService.getProperties(filters),
    { keepPreviousData: true }
  )

  const updateSort = (value) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('sort', value)
    setSearchParams(newParams)
  }

  const goToPage = (newPage) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', newPage.toString())
    setSearchParams(newParams)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const clearAllFilters = () => {
    setSearchParams({})
  }

  const handleSaveSearch = async () => {
    if (!isAuthenticated) {
      toast.info('Connectez-vous pour sauvegarder cette recherche')
      return
    }
    const name = window.prompt('Nom de cette recherche (ex: "Appart Casablanca -2M")', getTitle())
    if (!name) return

    setSavingSearch(true)
    try {
      const criteria = Object.fromEntries(
        Object.entries(filters).filter(([key, value]) =>
          !['page', 'per_page', 'sort'].includes(key) && Boolean(value)
        )
      )
      await buyerService.createSavedSearch({ name, criteria, notify_new_matches: true })
      toast.success('Recherche sauvegardée ! Vous recevrez un email pour chaque nouveau bien correspondant.')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la sauvegarde')
    } finally {
      setSavingSearch(false)
    }
  }

  // Count active filters for badge
  const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
    if (['page', 'per_page', 'sort'].includes(key)) return false
    return Boolean(value)
  }).length

  // Get the title based on filters
  const getTitle = () => {
    const parts = []
    if (filters.transaction_type === 'rent') {
      parts.push('Locations')
    } else if (filters.transaction_type === 'sale') {
      parts.push('Ventes')
    } else {
      parts.push('Annonces')
    }
    parts.push('immobilières')
    if (filters.city) {
      parts.push(`à ${filters.city}`)
    }
    return parts.join(' ')
  }

  const handleMarkerClick = (property) => {
    setSelectedProperty(property)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Search Bar */}
      <div className="hidden lg:block bg-white border-b border-gray-200 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <AdvancedSearch variant="compact" />
        </div>
      </div>

      {/* Mobile Search Toggle */}
      <div className="lg:hidden bg-white border-b border-gray-200 p-4">
        <button
          onClick={() => setShowMobileSearch(true)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 rounded-lg text-gray-600"
        >
          <span className="flex items-center gap-2">
            <FiFilter />
            <span>Rechercher et filtrer</span>
            {activeFiltersCount > 0 && (
              <span className="bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </span>
          <FiSliders />
        </button>
      </div>

      {/* Mobile Search Modal */}
      {showMobileSearch && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSearch(false)} />
          <div className="absolute inset-x-0 top-0 max-h-[90vh] overflow-auto bg-white rounded-b-2xl">
            <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center">
              <h2 className="font-semibold text-lg">Recherche avancée</h2>
              <button
                onClick={() => setShowMobileSearch(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <AdvancedSearch
                onSearch={() => setShowMobileSearch(false)}
                initialFilters={filters}
              />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Results Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">
              {getTitle()}
            </h1>
            <p className="text-gray-600 mt-1">
              {isLoading ? (
                <span className="animate-pulse">Chargement...</span>
              ) : (
                <>
                  <span className="font-semibold text-primary-600">{data?.total || 0}</span> annonces trouvées
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 mt-4 md:mt-0">
            {/* AI Query indicator */}
            {filters.ai_query && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm">
                <HiSparkles className="w-4 h-4" />
                <span className="max-w-[200px] truncate">"{filters.ai_query}"</span>
                <button
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams)
                    newParams.delete('ai_query')
                    setSearchParams(newParams)
                  }}
                  className="p-0.5 hover:bg-purple-200 rounded"
                >
                  <FiX className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Active filters summary */}
            {activeFiltersCount > 0 && (
              <>
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm"
                >
                  <FiX className="w-4 h-4" />
                  Effacer ({activeFiltersCount})
                </button>
                <button
                  onClick={handleSaveSearch}
                  disabled={savingSearch}
                  className="flex items-center gap-2 px-3 py-1.5 border border-primary-200 text-primary-700 hover:bg-primary-50 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  <FiBell className="w-4 h-4" />
                  Sauvegarder + alertes
                </button>
              </>
            )}

            {/* Sort */}
            <select
              value={filters.sort}
              onChange={(e) => updateSort(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* View mode toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode(VIEW_MODES.GRID)}
                className={`p-2 rounded transition-colors ${
                  viewMode === VIEW_MODES.GRID
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Vue grille"
              >
                <FiGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode(VIEW_MODES.LIST)}
                className={`p-2 rounded transition-colors hidden sm:block ${
                  viewMode === VIEW_MODES.LIST
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Vue liste"
              >
                <FiList className="w-4 h-4" />
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
                <FiMap className="w-4 h-4" />
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
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="8" height="18" rx="1" />
                  <rect x="13" y="3" width="8" height="18" rx="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">Une erreur est survenue lors du chargement des annonces.</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm animate-pulse">
                <div className="h-48 bg-gray-200"></div>
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Map View */}
            {viewMode === VIEW_MODES.MAP && (
              <PropertyMap
                properties={data?.properties || []}
                selectedId={selectedProperty?.id}
                onMarkerClick={handleMarkerClick}
                className="h-[calc(100vh-280px)] min-h-[500px]"
              />
            )}

            {/* Split View */}
            {viewMode === VIEW_MODES.SPLIT && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* List side */}
                <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                  {data?.properties?.map(property => (
                    <div
                      key={property.id}
                      onClick={() => setSelectedProperty(property)}
                      className={`cursor-pointer transition-all ${
                        selectedProperty?.id === property.id
                          ? 'ring-2 ring-primary-500 rounded-xl'
                          : ''
                      }`}
                    >
                      <PropertyCard property={property} variant="horizontal" />
                    </div>
                  ))}
                  {(!data?.properties || data.properties.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      Aucune annonce trouvée
                    </div>
                  )}
                </div>

                {/* Map side */}
                <div className="h-[calc(100vh-280px)] min-h-[500px] sticky top-24">
                  <PropertyMap
                    properties={data?.properties || []}
                    selectedId={selectedProperty?.id}
                    onMarkerClick={handleMarkerClick}
                    className="h-full"
                  />
                </div>
              </div>
            )}

            {/* Grid/List View */}
            {(viewMode === VIEW_MODES.GRID || viewMode === VIEW_MODES.LIST) && (
              <>
                {data?.properties?.length > 0 ? (
                  <>
                    <div className={viewMode === VIEW_MODES.GRID
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                      : "space-y-4"
                    }>
                      {data.properties.map(property => (
                        <PropertyCard
                          key={property.id}
                          property={property}
                          variant={viewMode === VIEW_MODES.LIST ? 'horizontal' : 'vertical'}
                        />
                      ))}
                    </div>

                    {/* Pagination */}
                    {data.pages > 1 && (
                      <div className="flex justify-center items-center gap-2 mt-10">
                        <button
                          onClick={() => goToPage(page - 1)}
                          disabled={page === 1}
                          className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <FiChevronLeft className="w-4 h-4" />
                          <span className="hidden sm:inline">Précédent</span>
                        </button>

                        {/* Page numbers */}
                        <div className="flex items-center gap-1">
                          {[...Array(Math.min(5, data.pages))].map((_, i) => {
                            let pageNum
                            if (data.pages <= 5) {
                              pageNum = i + 1
                            } else if (page <= 3) {
                              pageNum = i + 1
                            } else if (page >= data.pages - 2) {
                              pageNum = data.pages - 4 + i
                            } else {
                              pageNum = page - 2 + i
                            }

                            return (
                              <button
                                key={pageNum}
                                onClick={() => goToPage(pageNum)}
                                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                                  page === pageNum
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white border border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            )
                          })}
                        </div>

                        <button
                          onClick={() => goToPage(page + 1)}
                          disabled={page === data.pages}
                          className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <span className="hidden sm:inline">Suivant</span>
                          <FiChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Results info */}
                    <p className="text-center text-sm text-gray-500 mt-4">
                      Affichage {((page - 1) * 12) + 1} - {Math.min(page * 12, data.total)} sur {data.total} résultats
                    </p>
                  </>
                ) : (
                  /* Empty State */
                  <div className="text-center py-16">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <FiFilter className="w-10 h-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Aucune annonce trouvée
                    </h3>
                    <p className="text-gray-500 mb-6 max-w-md mx-auto">
                      Essayez de modifier vos critères de recherche ou d'élargir votre zone géographique.
                    </p>
                    <button
                      onClick={clearAllFilters}
                      className="btn-primary"
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <CompareBar />
    </div>
  )
}

export default PropertyList
