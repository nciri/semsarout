import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiSearch, FiMapPin } from 'react-icons/fi'

// Valeurs stables (envoyées à l'API) — les libellés sont résolus via t() au rendu,
// réutilisant common:advancedSearch.propertyTypes pour éviter la duplication.
const PROPERTY_TYPE_VALUES = ['apartment', 'house', 'villa', 'land', 'commercial', 'office']

const CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Agadir',
  'Fès', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan'
]

function SearchForm({ variant = 'full' }) {
  const { t } = useTranslation(['common'])
  const navigate = useNavigate()
  const [transactionType, setTransactionType] = useState('sale')
  const [city, setCity] = useState('')
  const [propertyType, setPropertyType] = useState('')

  const PROPERTY_TYPES = [
    { value: '', label: t('common:search.allTypes') },
    ...PROPERTY_TYPE_VALUES.map(value => ({
      value,
      label: t(`common:advancedSearch.propertyTypes.${value}`)
    }))
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (transactionType) params.set('transaction_type', transactionType)
    if (city) params.set('city', city)
    if (propertyType) params.set('property_type', propertyType)
    navigate(`/annonces?${params.toString()}`)
  }

  if (variant === 'compact') {
    return (
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-grow">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('common:search.cityNeighborhoodPlaceholder')}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button type="submit" className="btn-primary">
          {t('common:advancedSearch.search')}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6">
      {/* Transaction type tabs */}
      <div className="flex gap-4 mb-6">
        <button
          type="button"
          onClick={() => setTransactionType('sale')}
          className={`pb-2 font-medium border-b-2 transition-colors ${
            transactionType === 'sale'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('common:advancedSearch.buy')}
        </button>
        <button
          type="button"
          onClick={() => setTransactionType('rent')}
          className={`pb-2 font-medium border-b-2 transition-colors ${
            transactionType === 'rent'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('common:advancedSearch.rent')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* City */}
        <div className="md:col-span-2">
          <label className="label">{t('common:search.cityLabel')}</label>
          <div className="relative">
            <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input pl-10 appearance-none"
            >
              <option value="">{t('common:search.allCities')}</option>
              {CITIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Property type */}
        <div>
          <label className="label">{t('common:advancedSearch.propertyType')}</label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="input appearance-none"
          >
            {PROPERTY_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        {/* Submit */}
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full h-[42px]">
            <FiSearch className="w-5 h-5 mr-2" />
            {t('common:advancedSearch.search')}
          </button>
        </div>
      </div>
    </form>
  )
}

export default SearchForm
