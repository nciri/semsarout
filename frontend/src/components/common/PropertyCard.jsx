import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiMapPin, FiMaximize, FiHome, FiHeart, FiBarChart2, FiCheck } from 'react-icons/fi'
import { IoBedOutline } from 'react-icons/io5'
import { formatPrice, DIRHAM_SYMBOL } from '../../utils/currency'
import useCompareStore, { MAX_COMPARE_PROPERTIES } from '../../store/compareStore'

function PropertyCard({ property }) {
  const [fav, setFav] = useState(false)
  const { isSelected, toggle } = useCompareStore()
  const compared = isSelected(property.id)
  const primaryImage = property.images?.find(img => img.is_primary) || property.images?.[0]

  const handleToggleCompare = (e) => {
    e.preventDefault()
    const ok = toggle(property.id)
    if (!ok) {
      toast.info(`Vous pouvez comparer ${MAX_COMPARE_PROPERTIES} biens maximum`)
    }
  }

  return (
    <Link
      to={`/annonces/${property.id}`}
      className="block w-full bg-white rounded-ds-lg overflow-hidden border border-slate-200 shadow-ds-md hover:shadow-ds-lg hover:-translate-y-[3px] transition-all duration-200"
    >
      {/* Image */}
      <div className="relative h-[190px] bg-gradient-to-br from-slate-200 to-slate-300 overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage.url}
            alt={property.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <FiHome className="w-10 h-10" strokeWidth={1.5} />
          </div>
        )}

        {/* Badges — pills pleines (design system) */}
        <div className="absolute top-3 left-3 flex gap-2">
          {property.is_urgent && (
            <span className="text-[11px] font-bold px-[10px] py-[5px] rounded-full bg-redcard-500 text-white">Urgent</span>
          )}
          {property.is_premium && (
            <span className="text-[11px] font-bold px-[10px] py-[5px] rounded-full bg-primary-400 text-midnight">Premium</span>
          )}
          {!property.is_urgent && !property.is_premium && (
            <span className="text-[11px] font-bold px-[10px] py-[5px] rounded-full bg-midnight text-ivory">
              {property.transaction_type === 'sale' ? 'Vente' : 'Location'}
            </span>
          )}
        </div>

        {/* Favori + Comparer */}
        <div className="absolute top-2.5 right-2.5 flex gap-2">
          <button
            aria-label="Comparer"
            title="Ajouter au comparateur"
            onClick={handleToggleCompare}
            className={`w-[34px] h-[34px] rounded-full shadow-ds-sm flex items-center justify-center ${
              compared ? 'bg-primary-600' : 'bg-white/[.92]'
            }`}
          >
            {compared ? (
              <FiCheck className="w-[18px] h-[18px] text-white" strokeWidth={2} />
            ) : (
              <FiBarChart2 className="w-[18px] h-[18px] text-slate-600" strokeWidth={1.8} />
            )}
          </button>
          <button
            aria-label="Favori"
            onClick={(e) => { e.preventDefault(); setFav(!fav) }}
            className="w-[34px] h-[34px] rounded-full bg-white/[.92] shadow-ds-sm flex items-center justify-center"
          >
            <FiHeart
              className={`w-[18px] h-[18px] ${fav ? 'text-redcard-500 fill-redcard-500' : 'text-slate-600'}`}
              strokeWidth={1.8}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2">
        <h3 className="font-display font-bold text-[17px] text-midnight tracking-[-.01em] line-clamp-1 m-0">
          {property.title}
        </h3>

        <div className="flex items-center gap-[5px] text-slate-500 text-[13px]">
          <FiMapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{property.city}{property.neighborhood && ` — ${property.neighborhood}`}</span>
        </div>

        <div className="flex items-center gap-3.5 pt-1 text-[13px] font-medium text-slate-500">
          {property.surface && (
            <span className="inline-flex items-center gap-[5px]">
              <FiMaximize className="w-[15px] h-[15px]" strokeWidth={1.8} />
              {property.surface} m²
            </span>
          )}
          {property.bedrooms && (
            <span className="inline-flex items-center gap-[5px]">
              <IoBedOutline className="w-[15px] h-[15px]" />
              {property.bedrooms}
            </span>
          )}
          {property.rooms && <span>{property.rooms} pièces</span>}
        </div>

        <div className="mt-1.5 font-display font-extrabold text-[20px] text-midnight">
          {formatPrice(property.price, { suffix: false })}
          <span className="text-[13px] font-semibold text-slate-500 ml-1">
            {property.transaction_type === 'rent' ? `${DIRHAM_SYMBOL}/mois` : DIRHAM_SYMBOL}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default PropertyCard
