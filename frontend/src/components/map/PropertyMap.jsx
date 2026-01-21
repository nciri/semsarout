import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Marker, Popup } from 'react-leaflet'
import { FiMapPin, FiMaximize, FiX } from 'react-icons/fi'
import { IoBedOutline } from 'react-icons/io5'
import MapContainer, { createPriceMarker, FitBounds, MOROCCO_CENTER } from './MapContainer'
import { formatPrice } from '../../utils/currency'

function PropertyPopup({ property }) {
  const primaryImage = property.images?.find(img => img.is_primary) || property.images?.[0]

  return (
    <Link to={`/annonces/${property.id}`} className="block w-64">
      {/* Image */}
      <div className="relative h-32 bg-gray-200 rounded-t-lg overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage.url}
            alt={property.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <FiMapPin className="w-8 h-8" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="bg-white/90 text-gray-800 px-2 py-0.5 rounded text-xs font-medium">
            {property.transaction_type === 'sale' ? 'Vente' : 'Location'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 bg-white rounded-b-lg">
        <div className="text-lg font-bold text-primary-600 mb-1">
          {formatPrice(property.price)}
          {property.transaction_type === 'rent' && <span className="text-xs font-normal text-gray-500">/mois</span>}
        </div>
        <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-1">
          {property.title}
        </h3>
        <div className="flex items-center text-gray-500 text-xs mb-2">
          <FiMapPin className="w-3 h-3 mr-1" />
          <span className="truncate">{property.city}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {property.surface && (
            <span className="flex items-center">
              <FiMaximize className="w-3 h-3 mr-1" />
              {property.surface} m²
            </span>
          )}
          {property.bedrooms && (
            <span className="flex items-center">
              <IoBedOutline className="w-3 h-3 mr-1" />
              {property.bedrooms} ch.
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function PropertyMap({
  properties = [],
  selectedId = null,
  onMarkerClick = () => {},
  className = '',
  showList = false,
  onClose = () => {}
}) {
  const [hoveredId, setHoveredId] = useState(null)

  // Filter properties with valid coordinates
  const mappableProperties = useMemo(() => {
    return properties.filter(p => p.latitude && p.longitude)
  }, [properties])

  // Create markers data for FitBounds
  const markersData = useMemo(() => {
    return mappableProperties.map(p => ({ lat: p.latitude, lng: p.longitude }))
  }, [mappableProperties])

  // Format price for marker
  const formatMarkerPrice = (price) => {
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(1)}M Đ`
    } else if (price >= 1000) {
      return `${Math.round(price / 1000)}K Đ`
    }
    return `${price} Đ`
  }

  if (mappableProperties.length === 0) {
    return (
      <div className={`bg-gray-100 rounded-xl flex items-center justify-center ${className}`} style={{ minHeight: '400px' }}>
        <div className="text-center text-gray-500">
          <FiMapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune annonce avec coordonnées géographiques</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}>
      {/* Close button for fullscreen mode */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[1000] bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>
      )}

      <MapContainer center={MOROCCO_CENTER} zoom={6} className="w-full h-full">
        <FitBounds markers={markersData} />

        {mappableProperties.map(property => (
          <Marker
            key={property.id}
            position={[property.latitude, property.longitude]}
            icon={createPriceMarker(
              formatMarkerPrice(property.price),
              selectedId === property.id || hoveredId === property.id
            )}
            eventHandlers={{
              click: () => onMarkerClick(property),
              mouseover: () => setHoveredId(property.id),
              mouseout: () => setHoveredId(null)
            }}
          >
            <Popup closeButton={false} className="property-popup">
              <PropertyPopup property={property} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Property count badge */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg px-3 py-2 shadow-lg">
        <span className="text-sm font-medium text-gray-700">
          {mappableProperties.length} bien{mappableProperties.length > 1 ? 's' : ''} sur la carte
        </span>
      </div>
    </div>
  )
}
