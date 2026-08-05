import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiSearch, FiSliders, FiX, FiChevronDown, FiChevronUp,
  FiMapPin, FiHome, FiDollarSign, FiMaximize, FiLayers,
  FiDroplet, FiSun, FiStar, FiZap
} from 'react-icons/fi'
import { HiSparkles } from 'react-icons/hi2'
import { DIRHAM_SYMBOL } from '../../utils/currency'
import MultiSelectDropdown from './MultiSelectDropdown'

// Normalise une valeur de type de bien (tableau, chaîne "a,b" ou vide) en tableau
const toTypeArray = (v) =>
  Array.isArray(v) ? v : (v ? String(v).split(',').filter(Boolean) : [])

// Valeurs stables (envoyées à l'API) — les libellés sont résolus via t() au rendu.
const PROPERTY_TYPE_VALUES = ['apartment', 'house', 'villa', 'riad', 'land', 'commercial', 'office', 'garage']

// { value: valeur envoyée à l'API (peut contenir des accents/espaces), key: clé i18n stable }
const FEATURE_DEFS = [
  { value: 'parking', key: 'parking' },
  { value: 'garage', key: 'garage' },
  { value: 'jardin', key: 'jardin' },
  { value: 'terrasse', key: 'terrasse' },
  { value: 'balcon', key: 'balcon' },
  { value: 'piscine', key: 'piscine' },
  { value: 'ascenseur', key: 'ascenseur' },
  { value: 'gardien', key: 'gardien' },
  { value: 'climatisation', key: 'climatisation' },
  { value: 'chauffage', key: 'chauffage' },
  { value: 'meublé', key: 'meuble' },
  { value: 'cuisine équipée', key: 'cuisineEquipee' },
  { value: 'cave', key: 'cave' },
  { value: 'vue mer', key: 'vueMer' },
  { value: 'vue montagne', key: 'vueMontagne' },
  { value: 'duplex', key: 'duplex' }
]

const MOROCCAN_CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger',
  'Agadir', 'Meknès', 'Oujda', 'Kenitra', 'Tétouan',
  'El Jadida', 'Mohammedia', 'Beni Mellal', 'Nador', 'Safi'
]

const ENERGY_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

const PRICE_RANGES = {
  sale: [
    { min: 0, max: 500000, label: `< 500 000 ${DIRHAM_SYMBOL}` },
    { min: 500000, max: 1000000, label: `500 000 - 1 000 000 ${DIRHAM_SYMBOL}` },
    { min: 1000000, max: 2000000, label: `1 000 000 - 2 000 000 ${DIRHAM_SYMBOL}` },
    { min: 2000000, max: 5000000, label: `2 000 000 - 5 000 000 ${DIRHAM_SYMBOL}` },
    { min: 5000000, max: null, label: `> 5 000 000 ${DIRHAM_SYMBOL}` }
  ],
  rent: [
    { min: 0, max: 3000, label: `< 3 000 ${DIRHAM_SYMBOL}/mois` },
    { min: 3000, max: 5000, label: `3 000 - 5 000 ${DIRHAM_SYMBOL}/mois` },
    { min: 5000, max: 10000, label: `5 000 - 10 000 ${DIRHAM_SYMBOL}/mois` },
    { min: 10000, max: 20000, label: `10 000 - 20 000 ${DIRHAM_SYMBOL}/mois` },
    { min: 20000, max: null, label: `> 20 000 ${DIRHAM_SYMBOL}/mois` }
  ]
}

export default function AdvancedSearch({ onSearch, initialFilters = {}, variant = 'full' }) {
  const { t } = useTranslation(['common'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const PROPERTY_TYPES = PROPERTY_TYPE_VALUES.map(value => ({
    value,
    label: t(`common:advancedSearch.propertyTypes.${value}`)
  }))
  const FEATURES = FEATURE_DEFS.map(({ value, key }) => ({
    value,
    label: t(`common:advancedSearch.features.${key}`)
  }))

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [showAiTooltip, setShowAiTooltip] = useState(false)

  // Filter state
  const [filters, setFilters] = useState({
    transaction_type: initialFilters.transaction_type || searchParams.get('transaction_type') || 'sale',
    property_type: toTypeArray(initialFilters.property_type ?? searchParams.get('property_type')),
    city: initialFilters.city || searchParams.get('city') || '',
    neighborhood: initialFilters.neighborhood || searchParams.get('neighborhood') || '',
    min_price: initialFilters.min_price || searchParams.get('min_price') || '',
    max_price: initialFilters.max_price || searchParams.get('max_price') || '',
    min_surface: initialFilters.min_surface || searchParams.get('min_surface') || '',
    max_surface: initialFilters.max_surface || searchParams.get('max_surface') || '',
    min_rooms: initialFilters.min_rooms || searchParams.get('min_rooms') || '',
    max_rooms: initialFilters.max_rooms || searchParams.get('max_rooms') || '',
    min_bedrooms: initialFilters.min_bedrooms || searchParams.get('min_bedrooms') || '',
    min_bathrooms: initialFilters.min_bathrooms || searchParams.get('min_bathrooms') || '',
    features: initialFilters.features || searchParams.get('features')?.split(',') || [],
    energy_class: initialFilters.energy_class || searchParams.get('energy_class')?.split(',') || [],
    ground_floor: initialFilters.ground_floor || searchParams.get('ground_floor') === 'true',
    last_floor: initialFilters.last_floor || searchParams.get('last_floor') === 'true',
    min_construction_year: initialFilters.min_construction_year || searchParams.get('min_construction_year') || '',
    owner_type: initialFilters.owner_type || searchParams.get('owner_type') || '',
    has_photos: initialFilters.has_photos || searchParams.get('has_photos') === 'true',
    is_featured: initialFilters.is_featured || searchParams.get('is_featured') === 'true',
    q: initialFilters.q || searchParams.get('q') || ''
  })

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handlePropertyTypeToggle = (value) => {
    setFilters(prev => ({
      ...prev,
      property_type: prev.property_type.includes(value)
        ? prev.property_type.filter(t => t !== value)
        : [...prev.property_type, value]
    }))
  }

  const handleFeatureToggle = (feature) => {
    setFilters(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature]
    }))
  }

  const handleEnergyToggle = (energyClass) => {
    setFilters(prev => ({
      ...prev,
      energy_class: prev.energy_class.includes(energyClass)
        ? prev.energy_class.filter(e => e !== energyClass)
        : [...prev.energy_class, energyClass]
    }))
  }

  const buildQueryParams = () => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        if (Array.isArray(value)) {
          params.set(key, value.join(','))
        } else if (typeof value === 'boolean') {
          if (value) params.set(key, 'true')
        } else {
          params.set(key, value)
        }
      }
    })
    return params.toString()
  }

  const handleSearch = (e) => {
    e?.preventDefault()
    const queryString = buildQueryParams()
    if (onSearch) {
      onSearch(filters, aiQuery)
    } else {
      navigate(`/annonces?${queryString}`)
    }
  }

  const handleAiSearch = (e) => {
    e?.preventDefault()
    if (!aiQuery.trim()) return

    // For now, just navigate with the AI query as q parameter
    // In v2, this will be processed by AI
    const params = new URLSearchParams()
    params.set('ai_query', aiQuery)
    params.set('transaction_type', filters.transaction_type)
    navigate(`/annonces?${params.toString()}`)
  }

  const resetFilters = () => {
    setFilters({
      transaction_type: 'sale',
      property_type: [],
      city: '',
      neighborhood: '',
      min_price: '',
      max_price: '',
      min_surface: '',
      max_surface: '',
      min_rooms: '',
      max_rooms: '',
      min_bedrooms: '',
      min_bathrooms: '',
      features: [],
      energy_class: [],
      ground_floor: false,
      last_floor: false,
      min_construction_year: '',
      owner_type: '',
      has_photos: false,
      is_featured: false,
      q: ''
    })
    setAiQuery('')
  }

  const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'transaction_type') return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'boolean') return value
    return Boolean(value)
  }).length

  if (variant === 'compact') {
    return (
      <div className="bg-white rounded-xl shadow-lg">
        <form onSubmit={handleSearch} className="p-4">
          <div className="flex flex-wrap gap-4">
            {/* Transaction type toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => handleFilterChange('transaction_type', 'sale')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filters.transaction_type === 'sale'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                {t('common:advancedSearch.buy')}
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange('transaction_type', 'rent')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filters.transaction_type === 'rent'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                {t('common:advancedSearch.rent')}
              </button>
            </div>

            {/* City input */}
            <div className="flex-1 min-w-[200px] relative">
              <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('common:advancedSearch.cityPlaceholderCompact')}
                value={filters.city}
                onChange={(e) => handleFilterChange('city', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                list="city-suggestions"
              />
              <datalist id="city-suggestions">
                {MOROCCAN_CITIES.map(city => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </div>

            {/* Property type (multi-sélection) */}
            <MultiSelectDropdown
              label={t('common:advancedSearch.propertyType')}
              options={PROPERTY_TYPES}
              selected={filters.property_type}
              onToggle={handlePropertyTypeToggle}
              className="min-w-[170px]"
            />

            {/* Advanced filters button */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                showAdvanced
                  ? 'bg-primary-50 border-primary-500 text-primary-700'
                  : 'text-gray-600 hover:text-black border-gray-200 hover:bg-gray-50'
              }`}
            >
              <FiSliders />
              <span>{t('common:advancedSearch.filtersButton')}</span>
              {activeFiltersCount > 0 && (
                <span className="bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
              {showAdvanced ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
            </button>

            {/* Search button */}
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <FiSearch />
              <span>{t('common:advancedSearch.search')}</span>
            </button>
          </div>

          {/* Advanced filters panel for compact variant */}
          {showAdvanced && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
              {/* Price range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <FiDollarSign className="inline w-4 h-4 mr-1" />
                    {t('common:advancedSearch.priceMin')}
                  </label>
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.min_price}
                    onChange={(e) => handleFilterChange('min_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common:advancedSearch.priceMax')}</label>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.max_price}
                    onChange={(e) => handleFilterChange('max_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <FiMaximize className="inline w-4 h-4 mr-1" />
                    {t('common:advancedSearch.surfaceMin')}
                  </label>
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.min_surface}
                    onChange={(e) => handleFilterChange('min_surface', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common:advancedSearch.surfaceMax')}</label>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.max_surface}
                    onChange={(e) => handleFilterChange('max_surface', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Rooms */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <FiLayers className="inline w-4 h-4 mr-1" />
                    {t('common:advancedSearch.bedroomsMinCompact')}
                  </label>
                  <select
                    value={filters.min_bedrooms}
                    onChange={(e) => handleFilterChange('min_bedrooms', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">-</option>
                    {[1,2,3,4,5].map(n => (
                      <option key={n} value={n}>{n}+</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common:advancedSearch.roomsMin')}</label>
                  <select
                    value={filters.min_rooms}
                    onChange={(e) => handleFilterChange('min_rooms', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">-</option>
                    {[1,2,3,4,5,6,7,8].map(n => (
                      <option key={n} value={n}>{n}+</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <FiDroplet className="inline w-4 h-4 mr-1" />
                    {t('common:advancedSearch.bathroomsMin')}
                  </label>
                  <select
                    value={filters.min_bathrooms}
                    onChange={(e) => handleFilterChange('min_bathrooms', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">-</option>
                    {[1,2,3,4].map(n => (
                      <option key={n} value={n}>{n}+</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common:advancedSearch.sellerType')}</label>
                  <select
                    value={filters.owner_type}
                    onChange={(e) => handleFilterChange('owner_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('common:advancedSearch.sellerAll')}</option>
                    <option value="particular">{t('common:advancedSearch.sellerParticularCompact')}</option>
                    <option value="agency">{t('common:advancedSearch.sellerAgencyCompact')}</option>
                  </select>
                </div>
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FiStar className="inline w-4 h-4 mr-1" />
                  {t('common:advancedSearch.equipmentsCompact')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {FEATURES.slice(0, 12).map(feature => (
                    <button
                      key={feature.value}
                      type="button"
                      onClick={() => handleFeatureToggle(feature.value)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        filters.features.includes(feature.value)
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {feature.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.has_photos}
                    onChange={(e) => handleFilterChange('has_photos', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{t('common:advancedSearch.hasPhotosCompact')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.is_featured}
                    onChange={(e) => handleFilterChange('is_featured', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">
                    <FiSun className="inline w-4 h-4 mr-1 text-yellow-500" />
                    {t('common:advancedSearch.featuredCompact')}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.ground_floor}
                    onChange={(e) => handleFilterChange('ground_floor', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{t('common:advancedSearch.groundFloorCompact')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.last_floor}
                    onChange={(e) => handleFilterChange('last_floor', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{t('common:advancedSearch.lastFloor')}</span>
                </label>
              </div>

              {/* Reset button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm"
                >
                  <FiX className="w-4 h-4" />
                  {t('common:advancedSearch.resetFilters')}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-ds-xl shadow-ds-xl overflow-hidden">
      {/* AI Search Section (V2 Preview) — panneau midnight (design system) */}
      <div className="p-4" style={{ background: 'linear-gradient(120deg, #0B1220, #16233b)' }}>
        <div className="flex items-center gap-2 mb-2">
          <HiSparkles className="text-primary-400 w-5 h-5" />
          <span className="text-ivory font-semibold">{t('common:advancedSearch.aiSearchTitle')}</span>
          <span className="bg-white/[.12] text-ivory text-xs px-2 py-0.5 rounded-full">{t('common:advancedSearch.aiComingSoon')}</span>
        </div>
        <div className="relative">
          <input
            type="text"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder={t('common:advancedSearch.aiPlaceholder', { currency: DIRHAM_SYMBOL })}
            className="w-full px-4 py-3 pr-12 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:ring-2 focus:ring-white/50 focus:border-transparent"
            onFocus={() => setShowAiTooltip(true)}
            onBlur={() => setTimeout(() => setShowAiTooltip(false), 200)}
          />
          <button
            type="button"
            onClick={handleAiSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <FiSearch className="text-white" />
          </button>
        </div>
        {showAiTooltip && (
          <div className="mt-2 text-white/80 text-sm">
            {t('common:advancedSearch.aiTooltip')}
          </div>
        )}
      </div>

      {/* Standard Search */}
      <form onSubmit={handleSearch} className="p-6">
        {/* Transaction type */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => handleFilterChange('transaction_type', 'sale')}
              className={`px-8 py-3 rounded-lg text-sm font-bold transition-all ${
                filters.transaction_type === 'sale'
                  ? 'bg-white text-midnight shadow-ds-sm border-b-2 border-primary-400'
                  : 'text-slate-500 hover:text-midnight'
              }`}
            >
              {t('common:advancedSearch.buy')}
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('transaction_type', 'rent')}
              className={`px-8 py-3 rounded-lg text-sm font-bold transition-all ${
                filters.transaction_type === 'rent'
                  ? 'bg-white text-midnight shadow-ds-sm border-b-2 border-primary-400'
                  : 'text-slate-500 hover:text-midnight'
              }`}
            >
              {t('common:advancedSearch.rent')}
            </button>
          </div>
        </div>

        {/* Main filters row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FiMapPin className="inline w-4 h-4 mr-1" />
              {t('common:advancedSearch.location')}
            </label>
            <input
              type="text"
              placeholder={t('common:advancedSearch.cityPlaceholderFull')}
              value={filters.city}
              onChange={(e) => handleFilterChange('city', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              list="city-list"
            />
            <datalist id="city-list">
              {MOROCCAN_CITIES.map(city => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </div>

          {/* Property type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FiHome className="inline w-4 h-4 mr-1" />
              {t('common:advancedSearch.propertyType')}
            </label>
            <MultiSelectDropdown
              label={t('common:advancedSearch.allTypesOption')}
              options={PROPERTY_TYPES}
              selected={filters.property_type}
              onToggle={handlePropertyTypeToggle}
            />
          </div>

          {/* Price range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FiDollarSign className="inline w-4 h-4 mr-1" />
              {t('common:advancedSearch.budget')}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.min_price}
                onChange={(e) => handleFilterChange('min_price', e.target.value)}
                className="w-1/2 px-3 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <input
                type="number"
                placeholder="Max"
                value={filters.max_price}
                onChange={(e) => handleFilterChange('max_price', e.target.value)}
                className="w-1/2 px-3 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Rooms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FiLayers className="inline w-4 h-4 mr-1" />
              {t('common:advancedSearch.bedrooms')}
            </label>
            <select
              value={filters.min_bedrooms}
              onChange={(e) => handleFilterChange('min_bedrooms', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('common:advancedSearch.noneOption')}</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </div>
        </div>

        {/* Toggle advanced filters */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium mb-4"
        >
          <FiSliders />
          <span>{t('common:advancedSearch.filtersAdvanced')}</span>
          {activeFiltersCount > 0 && (
            <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full">
              {t('common:advancedSearch.filtersActiveCount', { count: activeFiltersCount })}
            </span>
          )}
          {showAdvanced ? <FiChevronUp /> : <FiChevronDown />}
        </button>

        {/* Advanced filters panel */}
        {showAdvanced && (
          <div className="border-t border-gray-200 pt-6 space-y-6">
            {/* Surface */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FiMaximize className="inline w-4 h-4 mr-1" />
                {t('common:advancedSearch.surface')}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.min_surface}
                  onChange={(e) => handleFilterChange('min_surface', e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.max_surface}
                  onChange={(e) => handleFilterChange('max_surface', e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Rooms & Bathrooms */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('common:advancedSearch.roomsMin')}</label>
                <select
                  value={filters.min_rooms}
                  onChange={(e) => handleFilterChange('min_rooms', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 text-black"
                >
                  <option value="">-</option>
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <option key={n} value={n}>{n}+</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('common:advancedSearch.roomsMax')}</label>
                <select
                  value={filters.max_rooms}
                  onChange={(e) => handleFilterChange('max_rooms', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 text-black"
                >
                  <option value="">-</option>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FiDroplet className="inline w-4 h-4 mr-1" />
                  {t('common:advancedSearch.bathroomsMin')}
                </label>
                <select
                  value={filters.min_bathrooms}
                  onChange={(e) => handleFilterChange('min_bathrooms', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 text-black"
                >
                  <option value="">-</option>
                  {[1,2,3,4].map(n => (
                    <option key={n} value={n}>{n}+</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('common:advancedSearch.constructionYear')}</label>
                <input
                  type="number"
                  placeholder={t('common:advancedSearch.constructionYearPlaceholder')}
                  value={filters.min_construction_year}
                  onChange={(e) => handleFilterChange('min_construction_year', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Floor preferences */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('common:advancedSearch.floor')}</label>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.ground_floor}
                    onChange={(e) => handleFilterChange('ground_floor', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{t('common:advancedSearch.groundFloor')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.last_floor}
                    onChange={(e) => handleFilterChange('last_floor', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{t('common:advancedSearch.lastFloor')}</span>
                </label>
              </div>
            </div>

            {/* Features */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FiStar className="inline w-4 h-4 mr-1" />
                {t('common:advancedSearch.equipmentsFull')}
              </label>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map(feature => (
                  <button
                    key={feature.value}
                    type="button"
                    onClick={() => handleFeatureToggle(feature.value)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      filters.features.includes(feature.value)
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {feature.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Owner type & other options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('common:advancedSearch.sellerTypeFull')}</label>
                <select
                  value={filters.owner_type}
                  onChange={(e) => handleFilterChange('owner_type', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">{t('common:advancedSearch.sellerAll')}</option>
                  <option value="particular">{t('common:advancedSearch.sellerParticularFull')}</option>
                  <option value="agency">{t('common:advancedSearch.sellerAgencyFull')}</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.has_photos}
                    onChange={(e) => handleFilterChange('has_photos', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{t('common:advancedSearch.hasPhotosFull')}</span>
                </label>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.is_featured}
                    onChange={(e) => handleFilterChange('is_featured', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">
                    <FiSun className="inline w-4 h-4 mr-1 text-yellow-500" />
                    {t('common:advancedSearch.featuredFull')}
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <FiX />
            <span>{t('common:advancedSearch.reset')}</span>
          </button>
          <button
            type="submit"
            className="flex items-center gap-2 px-8 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
          >
            <FiSearch />
            <span>{t('common:advancedSearch.search')}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
