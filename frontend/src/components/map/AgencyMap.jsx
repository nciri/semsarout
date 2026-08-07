import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Marker, Popup } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import { FiMapPin, FiPhone, FiHome, FiX } from 'react-icons/fi'
import MapContainer, { createAgencyMarker, FitBounds, MOROCCO_CENTER } from './MapContainer'

function AgencyPopup({ agency }) {
  const { t } = useTranslation(['common'])
  return (
    <div className="w-64">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-3">
        {agency.logo_url ? (
          <img
            src={agency.logo_url}
            alt={agency.name}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div className="w-12 h-12 bg-terracotta-100 rounded-lg flex items-center justify-center">
            <FiHome className="w-6 h-6 text-terracotta-600" />
          </div>
        )}
        <div>
          <h3 className="font-semibold text-gray-900 line-clamp-1">{agency.name}</h3>
          {agency.is_verified && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {t('common:map.agency.verified')}
            </span>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="flex items-start text-sm text-gray-600 mb-2">
        <FiMapPin className="w-4 h-4 me-2 mt-0.5 flex-shrink-0" />
        <span>{agency.address}, {agency.city}</span>
      </div>

      {/* Contact */}
      {agency.phone && (
        <div className="flex items-center text-sm text-gray-600 mb-2">
          <FiPhone className="w-4 h-4 me-2" />
          <span>{agency.phone}</span>
        </div>
      )}

      {/* Properties count */}
      <div className="text-sm text-gray-500 mb-3">
        {t('common:map.agency.activeListings', { count: agency.properties_count || 0 })}
      </div>

      {/* Link */}
      <Link
        to={`/agences/${agency.slug}`}
        className="block w-full text-center py-2 bg-terracotta-600 text-white rounded-lg text-sm font-medium hover:bg-terracotta-700 transition-colors"
      >
        {t('common:map.agency.viewAgency')}
      </Link>
    </div>
  )
}

export default function AgencyMap({
  agencies = [],
  selectedId = null,
  onMarkerClick = () => {},
  className = '',
  onClose = null
}) {
  const { t } = useTranslation(['common'])
  const [hoveredId, setHoveredId] = useState(null)

  // Filter agencies with valid coordinates
  const mappableAgencies = useMemo(() => {
    return agencies.filter(a => a.latitude && a.longitude)
  }, [agencies])

  // Create markers data for FitBounds
  const markersData = useMemo(() => {
    return mappableAgencies.map(a => ({ lat: a.latitude, lng: a.longitude }))
  }, [mappableAgencies])

  if (mappableAgencies.length === 0) {
    return (
      <div className={`bg-gray-100 rounded-xl flex items-center justify-center ${className}`} style={{ minHeight: '400px' }}>
        <div className="text-center text-gray-500">
          <FiMapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('common:map.agency.empty')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}>
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 end-4 z-[1000] bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>
      )}

      <MapContainer center={MOROCCO_CENTER} zoom={6} className="w-full h-full">
        <FitBounds markers={markersData} />

        {mappableAgencies.map(agency => (
          <Marker
            key={agency.id}
            position={[agency.latitude, agency.longitude]}
            icon={createAgencyMarker(selectedId === agency.id || hoveredId === agency.id)}
            eventHandlers={{
              click: () => onMarkerClick(agency),
              mouseover: () => setHoveredId(agency.id),
              mouseout: () => setHoveredId(null)
            }}
          >
            <Popup closeButton={false} className="agency-popup">
              <AgencyPopup agency={agency} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Agency count badge */}
      <div className="absolute bottom-4 start-4 z-[1000] bg-white rounded-lg px-3 py-2 shadow-lg">
        <span className="text-sm font-medium text-gray-700">
          {t('common:map.agency.count', { count: mappableAgencies.length })}
        </span>
      </div>
    </div>
  )
}
