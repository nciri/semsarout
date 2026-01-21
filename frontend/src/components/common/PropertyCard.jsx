import { Link } from 'react-router-dom'
import { FiMapPin, FiMaximize, FiHome } from 'react-icons/fi'
import { IoBedOutline } from 'react-icons/io5'
import { formatPrice } from '../../utils/currency'

function PropertyCard({ property }) {

  const primaryImage = property.images?.find(img => img.is_primary) || property.images?.[0]

  return (
    <Link to={`/annonces/${property.id}`} className="card group">
      {/* Image */}
      <div className="relative h-48 bg-gray-200 overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage.url}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <FiHome className="w-12 h-12" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-2">
          {property.is_urgent && (
            <span className="badge-urgent">Urgent</span>
          )}
          {property.is_premium && (
            <span className="badge bg-gold-400 text-gold-900">Premium</span>
          )}
        </div>

        {/* Transaction type */}
        <div className="absolute bottom-2 left-2">
          <span className="badge bg-white/90 text-gray-800">
            {property.transaction_type === 'sale' ? 'Vente' : 'Location'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Price */}
        <div className="text-xl font-bold text-primary-600 mb-1">
          {formatPrice(property.price)}
          {property.transaction_type === 'rent' && <span className="text-sm font-normal text-gray-500">/mois</span>}
        </div>

        {/* Title */}
        <h3 className="font-medium text-gray-900 mb-2 line-clamp-1">
          {property.title}
        </h3>

        {/* Location */}
        <div className="flex items-center text-gray-500 text-sm mb-3">
          <FiMapPin className="w-4 h-4 mr-1" />
          <span className="truncate">{property.city}{property.neighborhood && `, ${property.neighborhood}`}</span>
        </div>

        {/* Features */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {property.surface && (
            <div className="flex items-center">
              <FiMaximize className="w-4 h-4 mr-1" />
              <span>{property.surface} m²</span>
            </div>
          )}
          {property.bedrooms && (
            <div className="flex items-center">
              <IoBedOutline className="w-4 h-4 mr-1" />
              <span>{property.bedrooms} ch.</span>
            </div>
          )}
          {property.rooms && (
            <div className="flex items-center">
              <span>{property.rooms} pièces</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export default PropertyCard
