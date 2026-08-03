import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from 'react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import {
  FiMapPin, FiMaximize, FiPhone, FiMail, FiHeart,
  FiShare2, FiChevronLeft, FiChevronRight, FiCheck, FiZoomIn, FiEye, FiFileText,
  FiUploadCloud, FiTrash2
} from 'react-icons/fi'
import { IoBedOutline, IoWaterOutline } from 'react-icons/io5'
import { propertyService } from '../services/propertyService'
import { buyerService } from '../services/buyerService'
import { applicantService } from '../services/rentalService'
import api from '../services/api'
import { formatPrice } from '../utils/currency'
import PhotoLightbox from '../components/common/PhotoLightbox'
import PriceGauge from '../components/common/PriceGauge'
import BookVisitWidget from '../components/common/BookVisitWidget'
import useAuthStore from '../store/authStore'
import { getAmenityIcon } from '../utils/amenityIcons'
import { DOC_TYPES } from './dashboard/applicationStatus'

const MAX_DOC_SIZE = 10 * 1024 * 1024

const LEAD_STATUS = {
  new: ['Nouveau', 'bg-blue-100 text-blue-700'],
  contacted: ['Contacté', 'bg-yellow-100 text-yellow-700'],
  qualified: ['Qualifié', 'bg-green-100 text-green-700'],
  converted: ['Converti', 'bg-purple-100 text-purple-700'],
  lost: ['Perdu', 'bg-gray-100 text-gray-600'],
}

function PropertyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isAuthenticated } = useAuthStore()
  const [currentImage, setCurrentImage] = useState(0)
  const [showContact, setShowContact] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [revealedPhone, setRevealedPhone] = useState(null)
  const [isRevealingPhone, setIsRevealingPhone] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyForm, setApplyForm] = useState({
    applicant_name: '', applicant_email: '', applicant_phone: '',
    monthly_income: '', guarantor_name: '', guarantor_income: '',
  })
  const [applyDocs, setApplyDocs] = useState([])
  const [pendingDocType, setPendingDocType] = useState(DOC_TYPES[0][0])
  const [uploadingDocs, setUploadingDocs] = useState(false)

  const { data: property, isLoading } = useQuery(
    ['property', id],
    () => propertyService.getProperty(id)
  )

  const { data: pricePosition } = useQuery(
    ['price-position', id],
    () => propertyService.getPricePosition(id),
    { enabled: !!id }
  )

  const isBuyer = !isAuthenticated || user?.account_role === 'buyer'

  const { data: favoritesData } = useQuery(
    ['favorites'],
    () => buyerService.getFavorites({ per_page: 100 }),
    { enabled: isAuthenticated && isBuyer }
  )

  const existingFavorite = favoritesData?.favorites?.find(
    (f) => f.property_id === Number(id)
  )

  // Agence propriétaire du bien : afficher les contacts intéressés par cette annonce
  const isOwnerAgency = isAuthenticated && !!user?.agency_id && !!property?.agency_id && user.agency_id === property.agency_id
  const { data: interestedData, isLoading: interestedLoading } = useQuery(
    ['property-leads', id],
    async () => (await api.get(`/backoffice/leads?property_id=${id}&per_page=100`)).data,
    { enabled: !!isOwnerAgency }
  )
  const interestedLeads = interestedData?.leads || []

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      navigate(`/connexion?redirect=/annonces/${id}`)
      return
    }
    try {
      if (existingFavorite) {
        await buyerService.removeFavorite(existingFavorite.id)
        toast.success('Retiré des favoris')
      } else {
        await buyerService.addFavorite(id)
        toast.success('Ajouté aux favoris')
      }
      queryClient.invalidateQueries(['favorites'])
    } catch (error) {
      toast.error(error.response?.data?.error || 'Une erreur est survenue')
    }
  }

  const handleShare = async () => {
    const shareData = {
      title: property?.title,
      text: `Découvrez ce bien sur SemsarOut : ${property?.title}`,
      url: window.location.href
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled share, ignore
      }
    } else {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Lien copié dans le presse-papier')
    }
  }

  const handleRevealPhone = async () => {
    if (revealedPhone) return
    setIsRevealingPhone(true)
    try {
      const data = await propertyService.revealPhone(id, {
        name: user ? `${user.first_name} ${user.last_name}` : undefined,
        email: user?.email
      })
      setRevealedPhone(data.phone)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Numéro indisponible pour ce bien')
    } finally {
      setIsRevealingPhone(false)
    }
  }

  // Calculate time remaining for urgent listing
  useEffect(() => {
    if (!property?.is_urgent || !property?.urgent_until) return

    const calculateTimeRemaining = () => {
      const now = new Date()
      const expiryDate = new Date(property.urgent_until)
      const diff = expiryDate - now

      if (diff <= 0) {
        setTimeRemaining(null)
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (days > 0) {
        setTimeRemaining(`${days}j ${hours}h`)
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`)
      } else {
        setTimeRemaining(`${minutes}m`)
      }
    }

    calculateTimeRemaining()
    const interval = setInterval(calculateTimeRemaining, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [property?.is_urgent, property?.urgent_until])

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm()

  // Prefill the contact form with the logged-in user's info when it opens
  useEffect(() => {
    if (showContact) {
      reset({
        name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '',
        email: user?.email || '',
        phone: user?.phone || '',
        message: `Bonjour, je suis intéressé(e) par votre bien "${property?.title || ''}". Pouvez-vous me contacter ?`
      })
    }
  }, [showContact, user, property?.title, reset])

  const onSubmitContact = async (data) => {
    try {
      await propertyService.contactProperty(id, data)
      toast.success('Votre message a été envoyé avec succès !')
      reset()
      setShowContact(false)
    } catch (error) {
      toast.error('Erreur lors de l\'envoi du message')
    }
  }

  // Prefill the application form with the logged-in user's info
  useEffect(() => {
    if (user) {
      setApplyForm((f) => ({
        ...f,
        applicant_name: [user.first_name, user.last_name].filter(Boolean).join(' '),
        applicant_email: user.email || '',
        applicant_phone: user.phone || '',
      }))
    }
  }, [user])

  const applyMut = useMutation(
    async () => {
      const created = await applicantService.submit({
        property_id: Number(id),
        applicant_name: applyForm.applicant_name,
        applicant_email: applyForm.applicant_email,
        applicant_phone: applyForm.applicant_phone,
        monthly_income: applyForm.monthly_income ? Number(applyForm.monthly_income) : null,
        guarantor_name: applyForm.guarantor_name || null,
        guarantor_income: applyForm.guarantor_income ? Number(applyForm.guarantor_income) : null,
      })
      if (applyDocs.length) {
        setUploadingDocs(true)
        try {
          for (const doc of applyDocs) {
            try {
              await applicantService.uploadDocument(created.id, doc.file, doc.docType)
            } catch (err) {
              toast.error(`Échec de l'envoi de « ${doc.file.name} »`)
            }
          }
        } finally {
          setUploadingDocs(false)
        }
      }
      return created
    },
    {
      onSuccess: () => {
        toast.success('Candidature envoyée avec vos pièces.')
        setApplyOpen(false)
        setApplyDocs([])
        navigate('/dashboard/candidatures')
      },
      onError: (error) => toast.error(error.response?.data?.error || 'Une erreur est survenue')
    }
  )

  const handleAddApplyDoc = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DOC_SIZE) {
      toast.error('Fichier trop volumineux (max 10 Mo)')
      return
    }
    setApplyDocs((docs) => [...docs, { docType: pendingDocType, file }])
  }

  const removeApplyDoc = (index) => {
    setApplyDocs((docs) => docs.filter((_, i) => i !== index))
  }

  const PROPERTY_TYPES = {
    apartment: 'Appartement',
    house: 'Maison',
    villa: 'Villa',
    land: 'Terrain',
    commercial: 'Local commercial',
    office: 'Bureau'
  }

  const PREMIUM_FEATURES = [
    'piscine', 'pool', 'garage', 'ascenseur', 'elevator', 'terrasse', 'terrace',
    'balcon', 'balcony', 'jardín', 'garden', 'parking', 'vue', 'view'
  ]

  const isPremiumFeature = (feature) => {
    return PREMIUM_FEATURES.some(pf => feature.toLowerCase().includes(pf))
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-96 bg-gray-200 rounded-xl mb-8"></div>
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500">Annonce non trouvée</p>
      </div>
    )
  }

  const images = property.images || []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/annonces" className="hover:text-primary-600">Annonces</Link>
        <span className="mx-2">/</span>
        <span>{property.city}</span>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{property.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Image Gallery */}
          <div className={`relative bg-gray-200 rounded-xl overflow-hidden h-96 mb-6 group ${property.is_premium ? 'premium-border' : ''}`}>
            {images.length > 0 ? (
              <>
                <img
                  src={images[currentImage]?.url}
                  alt={property.title}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setLightboxOpen(true)}
                />
                {/* Urgent Badge - Diagonal banner */}
                {property.is_urgent && (
                  <div className="absolute top-0 right-0 w-32 h-32 overflow-hidden">
                    <div className="absolute top-2 -right-10 w-40 h-12 bg-red-600 text-white font-bold text-center rotate-45 flex items-center justify-center shadow-lg">
                      URGENT
                    </div>
                  </div>
                )}
                {/* Zoom indicator */}
                <button
                  onClick={() => setLightboxOpen(true)}
                  className="absolute top-4 right-4 bg-black/50 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  title="Voir en grand"
                >
                  <FiZoomIn className="w-5 h-5" />
                </button>
                {/* Favori — même cœur que les cartes d'annonces */}
                {isBuyer && (
                  <button
                    aria-label="Favori"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleFavorite()
                    }}
                    className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white/[.92] shadow-ds-sm flex items-center justify-center z-10 hover:bg-white transition-colors"
                    title={existingFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  >
                    <FiHeart
                      className={`w-5 h-5 ${existingFavorite ? 'text-redcard-500 fill-redcard-500' : 'text-slate-600'}`}
                      strokeWidth={1.8}
                    />
                  </button>
                )}
                {/* Image counter */}
                <div className="absolute top-4 left-4 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
                  {currentImage + 1} / {images.length}
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setCurrentImage((prev) => (prev === 0 ? images.length - 1 : prev - 1))
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 hover:bg-white"
                    >
                      <FiChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setCurrentImage((prev) => (prev === images.length - 1 ? 0 : prev + 1))
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 hover:bg-white"
                    >
                      <FiChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                      {images.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation()
                            setCurrentImage(idx)
                          }}
                          className={`w-2 h-2 rounded-full ${
                            idx === currentImage ? 'bg-white' : 'bg-white/50'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                Aucune image
              </div>
            )}
          </div>

          {/* Photo Lightbox */}
          <PhotoLightbox
            images={images}
            initialIndex={currentImage}
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />

          {/* Title & Price */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                  {property.title}
                </h1>
                <div className="flex items-center gap-4 text-gray-600">
                  <div className="flex items-center">
                    <FiMapPin className="w-4 h-4 mr-1" />
                    <span>{property.city}{property.neighborhood && `, ${property.neighborhood}`}</span>
                  </div>
                  {property.views_count > 0 && (
                    <div className="flex items-center text-gray-500 text-sm">
                      <FiEye className="w-4 h-4 mr-1" />
                      <span>{property.views_count} vue{property.views_count > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className={`font-display text-[28px] font-extrabold ${property.is_premium ? 'premium-price' : property.is_urgent ? 'text-red-600' : 'text-midnight'}`}>
                  {formatPrice(property.price)}
                  {property.transaction_type === 'rent' && <span className="text-sm font-semibold text-slate-500">/mois</span>}
                </div>
                {property.price_per_sqm && (
                  <div className="text-sm text-gray-500">
                    {formatPrice(property.price_per_sqm)}/m²
                  </div>
                )}
                {property.is_urgent && timeRemaining && (
                  <div className="mt-2 text-sm font-bold text-red-600 bg-red-50 px-2 py-1 rounded inline-block">
                    Expire dans: {timeRemaining}
                  </div>
                )}
                {property.transaction_type === 'sale' && (
                  <Link
                    to={`/simulateur-credit?price=${property.price}`}
                    className="mt-2 text-sm text-primary-600 hover:underline inline-block"
                  >
                    Simuler un crédit pour ce bien
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Price positioning gauge */}
          {pricePosition?.available && (
            <div className="mb-8">
              <PriceGauge data={pricePosition} />
            </div>
          )}

          {/* Key Features */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {property.surface && (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <FiMaximize className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                <div className="font-semibold">{property.surface} m²</div>
                <div className="text-sm text-gray-500">Surface</div>
              </div>
            )}
            {property.rooms != null && (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="w-6 h-6 mx-auto text-gray-400 mb-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18M9 21V9"/>
                  </svg>
                </div>
                <div className="font-semibold">{property.rooms}</div>
                <div className="text-sm text-gray-500">Pièces</div>
              </div>
            )}
            {property.bedrooms != null && (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <IoBedOutline className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                <div className="font-semibold">{property.bedrooms}</div>
                <div className="text-sm text-gray-500">Chambres</div>
              </div>
            )}
            {property.bathrooms != null && (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <IoWaterOutline className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                <div className="font-semibold">{property.bathrooms}</div>
                <div className="text-sm text-gray-500">SDB</div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="mb-8">
            <h2 className="font-semibold text-lg mb-4">Description</h2>
            <p className="text-gray-600 whitespace-pre-line">
              {property.description || 'Aucune description fournie.'}
            </p>
          </div>

          {/* Features */}
          {property.features?.length > 0 && (
            <div className="mb-8">
              <h2 className="font-semibold text-lg mb-4">Caractéristiques</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {property.features.map((feature, idx) => {
                  const isFeatured = property.is_premium && isPremiumFeature(feature)
                  const Icon = getAmenityIcon(feature)
                  return (
                    <div key={idx} className={`flex items-center ${isFeatured ? 'text-yellow-700' : 'text-gray-600'}`}>
                      {isFeatured ? (
                        <span className="text-lg mr-2">⭐</span>
                      ) : (
                        <Icon className="w-4 h-4 text-primary-600 mr-2 flex-shrink-0" />
                      )}
                      <span className={isFeatured ? 'font-semibold' : ''}>{feature}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="mb-8">
            <h2 className="font-semibold text-lg mb-4">Détails</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Type</span>
                <span className="font-medium">{PROPERTY_TYPES[property.property_type]}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Transaction</span>
                <span className="font-medium">{property.transaction_type === 'sale' ? 'Vente' : 'Location'}</span>
              </div>
              {property.floor != null && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Étage</span>
                  <span className="font-medium">{property.floor === 0 ? 'RC' : property.floor}{property.total_floors && ` / ${property.total_floors}`}</span>
                </div>
              )}
              {property.construction_year && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Année de construction</span>
                  <span className="font-medium">{property.construction_year}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Référence</span>
                <span className="font-medium">{property.reference}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24">
            {/* Contacts intéressés — visible uniquement par l'agence propriétaire */}
            {isOwnerAgency && (
              <div className="card p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Contacts intéressés</h3>
                  <span className="badge-primary">{interestedLeads.length}</span>
                </div>
                {interestedLoading ? (
                  <p className="text-sm text-gray-400">Chargement…</p>
                ) : interestedLeads.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun contact intéressé pour l'instant.</p>
                ) : (
                  <ul className="space-y-3 max-h-[26rem] overflow-y-auto -mr-2 pr-2">
                    {interestedLeads.map((l) => (
                      <li key={l.id} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900 text-sm truncate">{l.name}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${LEAD_STATUS[l.status]?.[1] || 'bg-gray-100 text-gray-600'}`}>
                            {LEAD_STATUS[l.status]?.[0] || l.status}
                          </span>
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {l.email && (
                            <a href={`mailto:${l.email}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary-600">
                              <FiMail className="w-3.5 h-3.5 text-gray-400" /> <span className="truncate">{l.email}</span>
                            </a>
                          )}
                          {l.phone && (
                            <a href={`tel:${l.phone}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary-600">
                              <FiPhone className="w-3.5 h-3.5 text-gray-400" /> {l.phone}
                            </a>
                          )}
                        </div>
                        {l.message && <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{l.message}</p>}
                        <p className="text-[11px] text-gray-400 mt-1.5">
                          {l.created_at ? new Date(l.created_at).toLocaleDateString('fr-FR') : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/backoffice/leads" className="block text-center text-sm text-primary-600 hover:text-primary-700 mt-4">
                  Gérer dans le back-office →
                </Link>
              </div>
            )}

            {/* Contact Card */}
            <div className="card p-6 mb-6">
              <h3 className="font-semibold mb-4">Nous contacter</h3>

              {showContact ? (
                <form onSubmit={handleSubmit(onSubmitContact)} className="space-y-4">
                  <div>
                    <label className="label">Nom *</label>
                    <input
                      {...register('name', { required: 'Nom requis' })}
                      className="input"
                      placeholder="Votre nom"
                    />
                    {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="label">Email *</label>
                    <input
                      {...register('email', { required: 'Email requis' })}
                      type="email"
                      className="input"
                      placeholder="votre@email.com"
                    />
                    {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="label">Téléphone</label>
                    <input
                      {...register('phone')}
                      className="input"
                      placeholder="+212 6XX XXX XXX"
                    />
                  </div>
                  <div>
                    <label className="label">Message</label>
                    <textarea
                      {...register('message')}
                      className="input"
                      rows="4"
                      placeholder="Votre message..."
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary w-full"
                  >
                    {isSubmitting ? 'Envoi...' : 'Envoyer'}
                  </button>
                </form>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowContact(true)}
                    className="btn-primary w-full"
                  >
                    <FiMail className="w-4 h-4 mr-2" />
                    Envoyer un message
                  </button>
                  {revealedPhone ? (
                    <a href={`tel:${revealedPhone}`} className="btn-outline w-full">
                      <FiPhone className="w-4 h-4 mr-2" />
                      {revealedPhone}
                    </a>
                  ) : (
                    <button
                      onClick={handleRevealPhone}
                      disabled={isRevealingPhone}
                      className="btn-outline w-full"
                    >
                      <FiPhone className="w-4 h-4 mr-2" />
                      {isRevealingPhone ? 'Chargement...' : 'Nous appeler'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Postuler (location uniquement) */}
            {property.transaction_type === 'rent' && (
              <button
                onClick={() => isAuthenticated ? setApplyOpen(true) : navigate('/connexion', { state: { from: { pathname: `/annonces/${id}` } } })}
                className="btn-primary w-full flex items-center justify-center gap-2 mb-6"
              >
                <FiFileText className="w-5 h-5" /> Déposer un dossier de candidature
              </button>
            )}
            {isBuyer && <div className="mb-6"><BookVisitWidget propertyId={id} /></div>}

            {/* Actions */}
            <div className="flex gap-3">
              {isBuyer && (
                <button
                  onClick={handleToggleFavorite}
                  className={`btn-secondary flex-1 ${existingFavorite ? 'text-red-600 border-red-200' : ''}`}
                >
                  <FiHeart className={`w-4 h-4 mr-2 ${existingFavorite ? 'fill-current' : ''}`} />
                  {existingFavorite ? 'En favori' : 'Ajouter aux favoris'}
                </button>
              )}
              <button onClick={handleShare} className="btn-secondary flex-1">
                <FiShare2 className="w-4 h-4 mr-2" />
                Partager
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modale de candidature */}
      {applyOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">Déposer un dossier de candidature</h3>
            <form
              onSubmit={(e) => { e.preventDefault(); applyMut.mutate() }}
              className="space-y-4"
            >
              <div>
                <label className="label">Nom *</label>
                <input
                  className="input"
                  value={applyForm.applicant_name}
                  onChange={(e) => setApplyForm((f) => ({ ...f, applicant_name: e.target.value }))}
                  placeholder="Votre nom"
                  required
                />
              </div>
              <div>
                <label className="label">Email *</label>
                <input
                  type="email"
                  className="input"
                  value={applyForm.applicant_email}
                  onChange={(e) => setApplyForm((f) => ({ ...f, applicant_email: e.target.value }))}
                  placeholder="votre@email.com"
                  required
                />
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input
                  className="input"
                  value={applyForm.applicant_phone}
                  onChange={(e) => setApplyForm((f) => ({ ...f, applicant_phone: e.target.value }))}
                  placeholder="+212 6XX XXX XXX"
                />
              </div>
              <div>
                <label className="label">Revenu mensuel (Đh)</label>
                <input
                  type="number"
                  className="input"
                  value={applyForm.monthly_income}
                  onChange={(e) => setApplyForm((f) => ({ ...f, monthly_income: e.target.value }))}
                  placeholder="8000"
                />
              </div>
              <div>
                <label className="label">Nom du garant</label>
                <input
                  className="input"
                  value={applyForm.guarantor_name}
                  onChange={(e) => setApplyForm((f) => ({ ...f, guarantor_name: e.target.value }))}
                  placeholder="Nom du garant (facultatif)"
                />
              </div>
              <div>
                <label className="label">Revenu du garant (Đh)</label>
                <input
                  type="number"
                  className="input"
                  value={applyForm.guarantor_income}
                  onChange={(e) => setApplyForm((f) => ({ ...f, guarantor_income: e.target.value }))}
                  placeholder="Facultatif"
                />
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="label">Pièces jointes</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    className="input sm:w-56"
                    value={pendingDocType}
                    onChange={(e) => setPendingDocType(e.target.value)}
                  >
                    {DOC_TYPES.map(([value, labelText]) => (
                      <option key={value} value={value}>{labelText}</option>
                    ))}
                  </select>
                  <label className="btn-secondary flex-1 justify-center cursor-pointer">
                    <FiUploadCloud className="w-4 h-4 mr-2" />
                    Ajouter un fichier
                    <input type="file" className="hidden" onChange={handleAddApplyDoc} />
                  </label>
                </div>
                {applyDocs.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {applyDocs.map((doc, index) => (
                      <li
                        key={`${doc.file.name}-${index}`}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="truncate">
                          <span className="font-medium">
                            {DOC_TYPES.find(([value]) => value === doc.docType)?.[1] || doc.docType}
                          </span>
                          {' — '}{doc.file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeApplyDoc(index)}
                          className="text-gray-400 hover:text-red-600 shrink-0 ml-2"
                          aria-label="Retirer ce fichier"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setApplyOpen(false); setApplyDocs([]) }}
                  className="btn-secondary"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={applyMut.isLoading || uploadingDocs}
                  className="btn-primary"
                >
                  {uploadingDocs ? 'Envoi des pièces...' : applyMut.isLoading ? 'Envoi...' : 'Envoyer ma candidature'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PropertyDetail
