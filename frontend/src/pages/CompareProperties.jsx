import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiX, FiArrowLeft, FiCheck, FiMinus } from 'react-icons/fi'
import { propertyService } from '../services/propertyService'
import { formatPrice } from '../utils/currency'
import useCompareStore from '../store/compareStore'
import DirIcon from '../components/common/DirIcon'

function useRows(t) {
  return [
    { key: 'price', label: t('public:compare.rows.price'), format: (p) => formatPrice(p.price) },
    { key: 'price_per_sqm', label: t('public:compare.rows.pricePerSqm'), format: (p) => p.price_per_sqm ? formatPrice(p.price_per_sqm) : '—' },
    { key: 'surface', label: t('public:compare.rows.surface'), format: (p) => p.surface ? `${p.surface} m²` : '—' },
    { key: 'rooms', label: t('public:compare.rows.rooms'), format: (p) => p.rooms ?? '—' },
    { key: 'bedrooms', label: t('public:compare.rows.bedrooms'), format: (p) => p.bedrooms ?? '—' },
    { key: 'bathrooms', label: t('public:compare.rows.bathrooms'), format: (p) => p.bathrooms ?? '—' },
    { key: 'floor', label: t('public:compare.rows.floor'), format: (p) => p.floor != null ? (p.floor === 0 ? t('public:compare.rows.groundFloor') : p.floor) : '—' },
    { key: 'city', label: t('public:compare.rows.city'), format: (p) => p.city },
    { key: 'neighborhood', label: t('public:compare.rows.neighborhood'), format: (p) => p.neighborhood || '—' },
    { key: 'construction_year', label: t('public:compare.rows.constructionYear'), format: (p) => p.construction_year || '—' }
  ]
}

function CompareProperties() {
  const { t } = useTranslation(['public', 'common'])
  const [searchParams] = useSearchParams()
  const { remove } = useCompareStore()
  const ids = (searchParams.get('ids') || '').split(',').filter(Boolean).map(Number)
  const ROWS = useRows(t)

  const { data: properties, isLoading } = useQuery(
    ['compare-properties', ids],
    async () => {
      const results = await Promise.all(ids.map((id) => propertyService.getProperty(id)))
      return results
    },
    { enabled: ids.length > 0 }
  )

  const allFeatures = [...new Set((properties || []).flatMap((p) => p.features || []))]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/annonces" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6">
        <DirIcon icon={FiArrowLeft} className="w-4 h-4 me-2" /> {t('public:compare.backToListings')}
      </Link>

      <h1 className="font-display text-2xl font-bold text-gray-900 mb-6">{t('public:compare.title')}</h1>

      {ids.length === 0 ? (
        <div className="max-w-3xl mx-auto text-center py-16">
          <p className="text-gray-600 mb-4">{t('public:compare.emptyMessage')}</p>
        </div>
      ) : isLoading ? (
        <div className="animate-pulse h-96 bg-gray-200 rounded-xl"></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-start p-3 w-40"></th>
                {properties.map((p) => (
                  <th key={p.id} className="p-3 min-w-[220px]">
                    <div className="relative rounded-lg overflow-hidden mb-2 h-32 bg-gray-100">
                      {p.images?.[0] ? (
                        <img src={p.images[0].url} alt={p.title} className="w-full h-full object-cover" />
                      ) : null}
                      <button
                        onClick={() => remove(p.id)}
                        className="absolute top-1 end-1 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center"
                      >
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Link to={`/annonces/${p.id}`} className="font-semibold text-gray-900 hover:text-primary-600 text-sm line-clamp-2">
                      {p.title}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, idx) => (
                <tr key={row.key} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="p-3 text-sm font-medium text-gray-500">{row.label}</td>
                  {properties.map((p) => (
                    <td key={p.id} className="p-3 text-sm text-gray-900">{row.format(p)}</td>
                  ))}
                </tr>
              ))}
              {allFeatures.map((feature, idx) => (
                <tr key={feature} className={(ROWS.length + idx) % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="p-3 text-sm font-medium text-gray-500">{feature}</td>
                  {properties.map((p) => (
                    <td key={p.id} className="p-3">
                      {p.features?.includes(feature) ? (
                        <FiCheck className="w-4 h-4 text-green-600" />
                      ) : (
                        <FiMinus className="w-4 h-4 text-gray-300" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default CompareProperties
