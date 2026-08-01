import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiMapPin, FiMaximize, FiHome, FiHeart, FiBarChart2, FiCheck } from 'react-icons/fi'
import { IoBedOutline } from 'react-icons/io5'
import { formatPrice, DIRHAM_SYMBOL } from '../../utils/currency'
import useAuthStore from '../../store/authStore'
import { buyerService } from '../../services/buyerService'
import useCompareStore, { MAX_COMPARE_PROPERTIES } from '../../store/compareStore'

function PropertyCard({ property, variant = 'vertical' }) {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const primaryImage = property.images?.find(img => img.is_primary) || property.images?.[0]

  // Requête partagée (déduplée par react-query) : sait si ce bien est en favori
  const { data: favData } = useQuery(
    ['favorites'],
    () => buyerService.getFavorites({ per_page: 100 }),
    { enabled: isAuthenticated, staleTime: 30000 }
  )
  const favorite = favData?.favorites?.find(f => f.property_id === property.id)
  const isFav = !!favorite

  const toggleFav = useMutation(
    () => (favorite ? buyerService.removeFavorite(favorite.id) : buyerService.addFavorite(property.id)),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['favorites'])
        toast.success(favorite ? 'Retiré des favoris' : 'Ajouté aux favoris')
      },
      onError: () => toast.error('Une erreur est survenue')
    }
  )

  const handleFav = (e) => {
    e.preventDefault()
    if (!isAuthenticated) {
      toast.info('Connectez-vous pour ajouter aux favoris')
      navigate('/connexion')
      return
    }
    toggleFav.mutate()
  }

  const badges = (
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
  )

  const { isSelected, toggle } = useCompareStore()
  const compared = isSelected(property.id)

  const handleToggleCompare = (e) => {
    e.preventDefault()
    const ok = toggle(property.id)
    if (!ok) {
      toast.info(`Vous pouvez comparer ${MAX_COMPARE_PROPERTIES} biens maximum`)
    }
  }

  const favButton = (
    <div className="absolute top-2.5 right-2.5 flex gap-2">
      <button
        aria-label="Comparer"
        title="Ajouter au comparateur"
        onClick={handleToggleCompare}
        className={`w-[34px] h-[34px] rounded-full shadow-ds-sm flex items-center justify-center ${compared ? 'bg-primary-600' : 'bg-white/[.92]'}`}
      >
        {compared ? (
          <FiCheck className="w-[18px] h-[18px] text-white" strokeWidth={2} />
        ) : (
          <FiBarChart2 className="w-[18px] h-[18px] text-slate-600" strokeWidth={1.8} />
        )}
      </button>
      <button
        aria-label="Favori"
        onClick={handleFav}
        className="w-[34px] h-[34px] rounded-full bg-white/[.92] shadow-ds-sm flex items-center justify-center"
      >
        <FiHeart
          className={`w-[18px] h-[18px] ${isFav ? 'text-redcard-500 fill-redcard-500' : 'text-slate-600'}`}
          strokeWidth={1.8}
        />
      </button>
    </div>
  )

  const metaRow = (
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
  )

  const priceBlock = (
    <div className="font-display font-extrabold text-[20px] text-midnight">
      {formatPrice(property.price, { suffix: false })}
      <span className="text-[13px] font-semibold text-slate-500 ml-1">
        {property.transaction_type === 'rent' ? `${DIRHAM_SYMBOL}/mois` : DIRHAM_SYMBOL}
      </span>
    </div>
  )

  const location = (
    <div className="flex items-center gap-[5px] text-slate-500 text-[13px]">
      <FiMapPin className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{property.city}{property.neighborhood && ` — ${property.neighborhood}`}</span>
    </div>
  )

  // Vue liste : image à gauche, contenu + description à droite
  if (variant === 'horizontal') {
    return (
      <Link
        to={`/annonces/${property.id}`}
        className="flex w-full bg-white rounded-ds-lg overflow-hidden border border-slate-200 shadow-ds-md hover:shadow-ds-lg transition-all duration-200"
      >
        <div className="relative w-[200px] min-w-[200px] sm:w-[260px] sm:min-w-[260px] bg-gradient-to-br from-slate-200 to-slate-300 overflow-hidden">
          {primaryImage ? (
            <img src={primaryImage.url} alt={property.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              <FiHome className="w-10 h-10" strokeWidth={1.5} />
            </div>
          )}
          {badges}
          {favButton}
        </div>

        <div className="flex-1 p-4 flex flex-col gap-2 min-w-0">
          <h3 className="font-display font-bold text-[17px] text-midnight tracking-[-.01em] line-clamp-1 m-0">
            {property.title}
          </h3>
          {location}
          {metaRow}
          {property.description && (
            <p className="text-[13px] leading-snug text-slate-500 line-clamp-2">
              {property.description}
            </p>
          )}
          <div className="mt-auto pt-1.5">{priceBlock}</div>
        </div>
      </Link>
    )
  }

  // Vue grille (par défaut)
  return (
    <Link
      to={`/annonces/${property.id}`}
      className="flex flex-col h-full w-full bg-white rounded-ds-lg overflow-hidden border border-slate-200 shadow-ds-md hover:shadow-ds-lg hover:-translate-y-[3px] transition-all duration-200"
    >
      <div className="relative h-[190px] bg-gradient-to-br from-slate-200 to-slate-300 overflow-hidden">
        {primaryImage ? (
          <img src={primaryImage.url} alt={property.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <FiHome className="w-10 h-10" strokeWidth={1.5} />
          </div>
        )}
        {badges}
        {favButton}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-display font-bold text-[17px] text-midnight tracking-[-.01em] line-clamp-1 m-0">
          {property.title}
        </h3>
        {location}
        {metaRow}
        <div className="mt-auto pt-1.5">{priceBlock}</div>
      </div>
    </Link>
  )
}

export default PropertyCard
