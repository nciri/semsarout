import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { FiX, FiArrowLeft, FiCheck, FiMinus } from 'react-icons/fi'
import { propertyService } from '../services/propertyService'
import { formatPrice } from '../utils/currency'
import useCompareStore from '../store/compareStore'

const ROWS = [
  { key: 'price', label: 'Prix', format: (p) => formatPrice(p.price) },
  { key: 'price_per_sqm', label: 'Prix / m²', format: (p) => p.price_per_sqm ? formatPrice(p.price_per_sqm) : '—' },
  { key: 'surface', label: 'Surface', format: (p) => p.surface ? `${p.surface} m²` : '—' },
  { key: 'rooms', label: 'Pièces', format: (p) => p.rooms ?? '—' },
  { key: 'bedrooms', label: 'Chambres', format: (p) => p.bedrooms ?? '—' },
  { key: 'bathrooms', label: 'Salles de bain', format: (p) => p.bathrooms ?? '—' },
  { key: 'floor', label: 'Étage', format: (p) => p.floor != null ? (p.floor === 0 ? 'RC' : p.floor) : '—' },
  { key: 'city', label: 'Ville', format: (p) => p.city },
  { key: 'neighborhood', label: 'Quartier', format: (p) => p.neighborhood || '—' },
  { key: 'construction_year', label: 'Année construction', format: (p) => p.construction_year || '—' }
]

function CompareProperties() {
  const [searchParams] = useSearchParams()
  const { remove } = useCompareStore()
  const ids = (searchParams.get('ids') || '').split(',').filter(Boolean).map(Number)

  const { data: properties, isLoading } = useQuery(
    ['compare-properties', ids],
    async () => {
      const results = await Promise.all(ids.map((id) => propertyService.getProperty(id)))
      return results
    },
    { enabled: ids.length > 0 }
  )

  const allFeatures = [...new Set((properties || []).flatMap((p) => p.features || []))]

  if (ids.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Aucun bien sélectionné pour la comparaison.</p>
        <Link to="/annonces" className="btn-primary inline-flex">
          <FiArrowLeft className="w-4 h-4 mr-2" /> Retour aux annonces
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return <div className="max-w-6xl mx-auto px-4 py-16 animate-pulse h-96 bg-gray-200 rounded-xl"></div>
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/annonces" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6">
        <FiArrowLeft className="w-4 h-4 mr-2" /> Retour aux annonces
      </Link>

      <h1 className="font-display text-2xl font-bold text-gray-900 mb-6">Comparer les biens</h1>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-3 w-40"></th>
              {properties.map((p) => (
                <th key={p.id} className="p-3 min-w-[220px]">
                  <div className="relative rounded-lg overflow-hidden mb-2 h-32 bg-gray-100">
                    {p.images?.[0] ? (
                      <img src={p.images[0].url} alt={p.title} className="w-full h-full object-cover" />
                    ) : null}
                    <button
                      onClick={() => remove(p.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center"
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
    </div>
  )
}

export default CompareProperties
