import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiSearch, FiFilter, FiMapPin, FiCalendar, FiHome,
  FiCheckCircle, FiClock, FiAlertCircle, FiChevronDown
} from 'react-icons/fi'
import { DIRHAM_SYMBOL, formatPrice } from '../utils/currency'
import DirIcon from '../components/common/DirIcon'
import { useFormat } from '../utils/format'

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
  planning: { icon: FiClock, color: 'text-gray-500 bg-gray-100' },
  under_construction: { icon: FiAlertCircle, color: 'text-orange-500 bg-orange-100' },
  delivered: { icon: FiCheckCircle, color: 'text-green-500 bg-green-100' }
}

const PROGRAM_TYPE_VALUES = ['', 'residential', 'commercial', 'mixed']

const MOROCCAN_CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Oujda',
  'Kenitra', 'Tétouan', 'El Jadida', 'Mohammedia', 'Salé', 'Meknès'
]

function ProgramCard({ program, t, fmtDate }) {
  const constructionStatus = CONSTRUCTION_STATUS[program.construction_status] || CONSTRUCTION_STATUS.planning
  const ConstructionIcon = constructionStatus.icon
  const statusKey = program.construction_status && CONSTRUCTION_STATUS[program.construction_status]
    ? program.construction_status
    : 'planning'

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
        <div className="absolute top-3 start-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${constructionStatus.color}`}>
            <ConstructionIcon className="w-3.5 h-3.5" />
            {t(`public:programList.status.${statusKey}`)}
          </span>
        </div>
        {program.delivery_date && (
          <div className="absolute bottom-3 start-3 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
            <FiCalendar className="w-3 h-3" />
            {t('public:programList.deliveryDate', {
              date: fmtDate(program.delivery_date, { month: 'long', year: 'numeric' })
            })}
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
                  <p className="text-xs text-gray-500">{t('public:programList.fromPrice')}</p>
                  <p className="text-xl font-bold text-primary-600">
                    {formatPrice(program.min_price)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">{t('public:programList.priceOnRequest')}</p>
              )}
            </div>
            {program.available_units > 0 && (
              <div className="text-end">
                <p className="text-xs text-gray-500">{t('public:programList.available')}</p>
                <p className="text-lg font-semibold text-gray-900">
                  {t('public:programList.unitsCount', { count: program.available_units })}
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
  const { t } = useTranslation(['public', 'common'])
  const { fmtDate } = useFormat()
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
            {t('public:programList.title')}
          </h1>
          <p className="text-lg text-primary-100 mb-8 max-w-2xl">
            {t('public:programList.subtitle')}
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl">
            <div className="flex-1 relative">
              <FiSearch className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('public:programList.searchPlaceholder')}
                className="w-full ps-12 pe-4 py-4 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-4 bg-white text-primary-600 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
            >
              {t('public:programList.searchButton')}
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
              <option value="">{t('public:programList.allCities')}</option>
              {MOROCCAN_CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>

            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PROGRAM_TYPE_VALUES.map(value => (
                <option key={value || 'all'} value={value}>
                  {t(`public:programList.types.${value || 'all'}`)}
                </option>
              ))}
            </select>

            <select
              value={filters.construction_status}
              onChange={(e) => setFilters({ ...filters, construction_status: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('public:programList.allStatuses')}</option>
              {Object.keys(CONSTRUCTION_STATUS).map(key => (
                <option key={key} value={key}>{t(`public:programList.status.${key}`)}</option>
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
              {t('public:programList.moreFilters')}
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 bg-primary-600 text-white text-xs rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
              <DirIcon icon={FiChevronDown} className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {t('public:programList.reset')}
              </button>
            )}

            <div className="ms-auto text-sm text-gray-500">
              {t('public:programList.resultsCount', { count: data?.total || 0 })}
            </div>
          </div>

          {/* Extended filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('public:programList.minPriceLabel', { symbol: DIRHAM_SYMBOL })}
                </label>
                <input
                  type="number"
                  value={filters.min_price}
                  onChange={(e) => setFilters({ ...filters, min_price: e.target.value, page: 1 })}
                  placeholder={t('public:programList.minPricePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('public:programList.maxPriceLabel', { symbol: DIRHAM_SYMBOL })}
                </label>
                <input
                  type="number"
                  value={filters.max_price}
                  onChange={(e) => setFilters({ ...filters, max_price: e.target.value, page: 1 })}
                  placeholder={t('public:programList.maxPricePlaceholder')}
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
                <ProgramCard key={program.id} program={program} t={t} fmtDate={fmtDate} />
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
                  {t('public:programList.previous')}
                </button>
                <span className="text-gray-600">
                  {t('public:programList.pageOf', { page: filters.page, pages: data.pages })}
                </span>
                <button
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                  disabled={filters.page === data.pages}
                  className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  {t('public:programList.next')}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <FiHome className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('public:programList.emptyTitle')}</h3>
            <p className="text-gray-500 mb-4">
              {search || activeFiltersCount > 0
                ? t('public:programList.emptyWithFilters')
                : t('public:programList.emptyNoFilters')}
            </p>
            {(search || activeFiltersCount > 0) && (
              <button
                onClick={resetFilters}
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                {t('public:programList.resetFilters')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
