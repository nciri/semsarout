import { useParams, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { FiMapPin, FiPhone, FiMail, FiGlobe, FiArrowRight } from 'react-icons/fi'
import PropertyCard from '../components/common/PropertyCard'
import { agencyService } from '../services/agencyService'

function AgencyDetail() {
  const { slug } = useParams()

  const { data: agency, isLoading: isLoadingAgency } = useQuery(
    ['agency', slug],
    () => agencyService.getAgency(slug)
  )

  const { data: propertiesData, isLoading: isLoadingProperties } = useQuery(
    ['agency-properties', slug],
    () => agencyService.getAgencyProperties(slug, { per_page: 6 }),
    { enabled: !!agency }
  )

  if (isLoadingAgency) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-48 bg-gray-200 rounded-xl mb-8"></div>
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    )
  }

  if (!agency) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500">Agence non trouvée</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center">
            {agency.logo_url ? (
              <img
                src={agency.logo_url}
                alt={agency.name}
                className="w-24 h-24 rounded-xl object-cover mr-6"
              />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-terracotta-500 rounded-xl flex items-center justify-center mr-6">
                <span className="text-4xl font-bold text-white">
                  {agency.name.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <h1 className="font-display text-3xl font-bold mb-2">{agency.name}</h1>
              <div className="flex items-center text-gray-300">
                <FiMapPin className="w-4 h-4 mr-1" />
                <span>{agency.city}{agency.address && `, ${agency.address}`}</span>
              </div>
              {agency.is_verified && (
                <span className="mt-2 inline-block badge-success">Agence vérifiée</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Description */}
            {agency.description && (
              <div className="mb-8">
                <h2 className="font-semibold text-lg mb-4">À propos</h2>
                <p className="text-gray-600">{agency.description}</p>
              </div>
            )}

            {/* Properties */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-semibold text-lg">Annonces ({propertiesData?.total || 0})</h2>
                {propertiesData?.total > 6 && (
                  <Link
                    to={`/annonces?agency_id=${agency.id}`}
                    className="text-primary-600 hover:text-primary-700 flex items-center text-sm"
                  >
                    Voir toutes <FiArrowRight className="ml-1" />
                  </Link>
                )}
              </div>

              {isLoadingProperties ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="card animate-pulse">
                      <div className="h-48 bg-gray-200"></div>
                      <div className="p-4 space-y-3">
                        <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : propertiesData?.properties?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {propertiesData.properties.map(property => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  Aucune annonce active pour le moment.
                </p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24">
              <h3 className="font-semibold mb-4">Contact</h3>

              <div className="space-y-4">
                {agency.phone && (
                  <a
                    href={`tel:${agency.phone}`}
                    className="flex items-center text-gray-600 hover:text-primary-600"
                  >
                    <FiPhone className="w-5 h-5 mr-3" />
                    <span>{agency.phone}</span>
                  </a>
                )}
                {agency.email && (
                  <a
                    href={`mailto:${agency.email}`}
                    className="flex items-center text-gray-600 hover:text-primary-600"
                  >
                    <FiMail className="w-5 h-5 mr-3" />
                    <span>{agency.email}</span>
                  </a>
                )}
                {agency.website && (
                  <a
                    href={agency.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-gray-600 hover:text-primary-600"
                  >
                    <FiGlobe className="w-5 h-5 mr-3" />
                    <span>Site web</span>
                  </a>
                )}
              </div>

              {agency.address && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium text-sm text-gray-500 mb-2">Adresse</h4>
                  <p className="text-gray-700">
                    {agency.address}
                    {agency.postal_code && <br />}
                    {agency.postal_code} {agency.city}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgencyDetail
