import { useState } from 'react'
import { useQuery } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import {
  FiMapPin, FiCalendar, FiHome, FiPhone, FiMail, FiShare2,
  FiCheckCircle, FiClock, FiAlertCircle, FiChevronLeft, FiChevronRight,
  FiDownload, FiPlay, FiX, FiMaximize2
} from 'react-icons/fi'
import { formatPrice } from '../utils/currency'
import { getAmenityIcon } from '../utils/amenityIcons'
import LotPlanViewer from '../components/common/LotPlanViewer'

const programsService = {
  getProgram: async (slug) => {
    const response = await fetch(`/api/v1/programs/${slug}`)
    if (!response.ok) throw new Error('Failed to fetch program')
    return response.json()
  }
}

const CONSTRUCTION_STATUS = {
  planning: { label: 'En projet', icon: FiClock, color: 'text-gray-600 bg-gray-100' },
  under_construction: { label: 'En construction', icon: FiAlertCircle, color: 'text-orange-600 bg-orange-100' },
  delivered: { label: 'Livré', icon: FiCheckCircle, color: 'text-green-600 bg-green-100' }
}

const UNIT_TYPES = {
  studio: 'Studio',
  apartment: 'Appartement',
  duplex: 'Duplex',
  villa: 'Villa',
  penthouse: 'Penthouse',
  commercial: 'Local commercial'
}

const AMENITIES_LABELS = {
  pool: 'Piscine',
  gym: 'Salle de sport',
  security: 'Sécurité 24h',
  parking: 'Parking',
  garden: 'Jardin',
  playground: 'Aire de jeux',
  concierge: 'Conciergerie',
  elevator: 'Ascenseur',
  terrace: 'Terrasse',
  spa: 'Spa'
}

const safeUrl = (url) => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? url : null
  } catch {
    return null
  }
}

function ImageGallery({ images, coverImage }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  const allImages = [
    ...(coverImage ? [{ url: coverImage, image_type: 'cover' }] : []),
    ...images
  ]

  if (allImages.length === 0) return null

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % allImages.length)
  }

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + allImages.length) % allImages.length)
  }

  return (
    <>
      <div className="relative aspect-video bg-gray-200 rounded-xl overflow-hidden">
        <img
          src={allImages[currentIndex].url}
          alt="Program"
          className="w-full h-full object-cover"
        />

        {allImages.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-white/90 rounded-full shadow hover:bg-white"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white/90 rounded-full shadow hover:bg-white"
            >
              <FiChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <button
          onClick={() => setFullscreen(true)}
          className="absolute bottom-3 right-3 p-2 bg-white/90 rounded-full shadow hover:bg-white"
        >
          <FiMaximize2 className="w-5 h-5" />
        </button>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
          {allImages.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === currentIndex ? 'bg-white' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Thumbnails */}
      {allImages.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
          {allImages.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                idx === currentIndex ? 'border-primary-500' : 'border-transparent'
              }`}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen modal */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full"
          >
            <FiX className="w-6 h-6" />
          </button>
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/10 rounded-full"
          >
            <FiChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/10 rounded-full"
          >
            <FiChevronRight className="w-8 h-8" />
          </button>
          <img
            src={allImages[currentIndex].url}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain"
          />
        </div>
      )}
    </>
  )
}

function UnitCard({ unit }) {
  return (
    <div className="bg-gray-50 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-900">{unit.name}</h4>
          <p className="text-sm text-gray-500">
            {UNIT_TYPES[unit.unit_type] || unit.unit_type}
          </p>
        </div>
        {unit.available_count > 0 && (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            {unit.available_count} disponible{unit.available_count > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {(unit.surface_min > 0 || unit.surface_max > 0) && (
          <div>
            <span className="text-gray-500">Surface</span>
            <p className="font-medium">
              {unit.surface_min === unit.surface_max || !unit.surface_max
                ? `${unit.surface_min} m²`
                : `${unit.surface_min} - ${unit.surface_max} m²`}
            </p>
          </div>
        )}
        {unit.rooms > 0 && (
          <div>
            <span className="text-gray-500">Pièces</span>
            <p className="font-medium">{unit.rooms}</p>
          </div>
        )}
        {unit.bedrooms > 0 && (
          <div>
            <span className="text-gray-500">Chambres</span>
            <p className="font-medium">{unit.bedrooms}</p>
          </div>
        )}
        {unit.bathrooms > 0 && (
          <div>
            <span className="text-gray-500">SDB</span>
            <p className="font-medium">{unit.bathrooms}</p>
          </div>
        )}
      </div>

      {(unit.price_from > 0 || unit.price_to > 0) && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <span className="text-sm text-gray-500">Prix</span>
          <p className="text-lg font-bold text-primary-600">
            {unit.price_from === unit.price_to || !unit.price_to
              ? formatPrice(unit.price_from)
              : `${formatPrice(unit.price_from)} - ${formatPrice(unit.price_to)}`}
          </p>
        </div>
      )}
    </div>
  )
}

function ContactForm({ program }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    message: `Je suis intéressé(e) par le programme "${program?.name}".`
  })
  const [submitted, setSubmitted] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setIsSending(true)
    try {
      const response = await fetch(`/api/v1/programs/${program.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Erreur lors de l\'envoi')
      }
      setSubmitted(true)
    } catch (error) {
      setSubmitError(error.message)
    } finally {
      setIsSending(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-green-50 rounded-xl p-6 text-center">
        <FiCheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Message envoyé !</h3>
        <p className="text-gray-600">
          L'agence vous contactera dans les plus brefs délais.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {submitError && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {submitError}
        </div>
      )}
      <div>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Votre nom *"
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
      <div>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="Téléphone *"
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
      <div>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="Email"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
      <div>
        <textarea
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          placeholder="Votre message"
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
      <button
        type="submit"
        disabled={isSending}
        className="w-full py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {isSending ? 'Envoi...' : 'Envoyer ma demande'}
      </button>
    </form>
  )
}

export default function ProgramDetail() {
  const { slug } = useParams()

  const { data, isLoading, error } = useQuery(
    ['program', slug],
    () => programsService.getProgram(slug)
  )

  const program = data?.program

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="aspect-video bg-gray-200 rounded-xl mb-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-32 bg-gray-200 rounded"></div>
              </div>
              <div className="h-64 bg-gray-200 rounded-xl"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !program) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FiHome className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Programme non trouvé</h2>
          <p className="text-gray-500 mb-4">Ce programme n'existe pas ou n'est plus disponible.</p>
          <Link
            to="/programmes"
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
          >
            <FiChevronLeft className="w-4 h-4" />
            Retour aux programmes
          </Link>
        </div>
      </div>
    )
  }

  const constructionStatus = CONSTRUCTION_STATUS[program.construction_status] || CONSTRUCTION_STATUS.planning
  const ConstructionIcon = constructionStatus.icon

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-gray-500 hover:text-gray-700">Accueil</Link>
            <span className="text-gray-300">/</span>
            <Link to="/programmes" className="text-gray-500 hover:text-gray-700">Programmes</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900">{program.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Gallery */}
            <ImageGallery
              images={program.images || []}
              coverImage={program.cover_image_url}
            />

            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${constructionStatus.color}`}>
                  <ConstructionIcon className="w-4 h-4" />
                  {constructionStatus.label}
                </span>
                {program.delivery_date && (
                  <span className="flex items-center gap-1.5 text-sm text-gray-500">
                    <FiCalendar className="w-4 h-4" />
                    Livraison {new Date(program.delivery_date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold text-gray-900 mb-2">{program.name}</h1>

              <p className="flex items-center gap-2 text-gray-600">
                <FiMapPin className="w-5 h-5" />
                {program.address && `${program.address}, `}
                {program.neighborhood && `${program.neighborhood}, `}
                {program.city}
              </p>
            </div>

            {/* Price range */}
            {(program.min_price || program.max_price) && (
              <div className="bg-primary-50 rounded-xl p-6">
                <p className="text-sm text-primary-600 mb-1">Prix à partir de</p>
                <p className="text-3xl font-bold text-primary-700">
                  {formatPrice(program.min_price)}
                  {program.max_price && program.max_price !== program.min_price && (
                    <span className="text-lg font-normal text-primary-500">
                      {' '} - {formatPrice(program.max_price)}
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Description */}
            {program.description && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Description</h2>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-600 whitespace-pre-line">{program.description}</p>
                </div>
              </div>
            )}

            {/* Units */}
            {program.units && program.units.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Types de biens disponibles
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {program.units.map(unit => (
                    <UnitCard key={unit.id} unit={unit} />
                  ))}
                </div>
              </div>
            )}

            {/* Interactive lot plan */}
            <LotPlanViewer programId={program.id} programName={program.name} />

            {/* Amenities */}
            {program.amenities && program.amenities.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Équipements et services
                </h2>
                <div className="flex flex-wrap gap-2">
                  {program.amenities.map(amenity => {
                    const label = AMENITIES_LABELS[amenity] || amenity
                    const Icon = getAmenityIcon(label)
                    return (
                      <span
                        key={amenity}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium"
                      >
                        <Icon className="w-4 h-4 text-primary-600" />
                        {label}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Documents */}
            {(safeUrl(program.brochure_url) || safeUrl(program.video_url)) && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents</h2>
                <div className="flex flex-wrap gap-3">
                  {safeUrl(program.brochure_url) && (
                    <a
                      href={safeUrl(program.brochure_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <FiDownload className="w-4 h-4" />
                      Télécharger la brochure
                    </a>
                  )}
                  {safeUrl(program.video_url) && (
                    <a
                      href={safeUrl(program.video_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <FiPlay className="w-4 h-4" />
                      Voir la vidéo
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Demander plus d'informations
              </h3>
              <ContactForm program={program} />

              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  {program.agency_phone && (
                    <a
                      href={`tel:${program.agency_phone}`}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <FiPhone className="w-4 h-4" />
                      Appeler
                    </a>
                  )}
                  <button
                    onClick={async () => {
                      const shareData = {
                        title: program.name,
                        text: `Découvrez le programme immobilier "${program.name}" sur SemsarOut`,
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
                      }
                    }}
                    className="p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    title="Partager"
                  >
                    <FiShare2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">En résumé</h3>
              <dl className="space-y-4">
                {program.total_units > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Nombre total d'unités</dt>
                    <dd className="font-medium text-gray-900">{program.total_units}</dd>
                  </div>
                )}
                {program.available_units > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Unités disponibles</dt>
                    <dd className="font-medium text-green-600">{program.available_units}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500">Référence</dt>
                  <dd className="font-medium text-gray-900">{program.reference}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
