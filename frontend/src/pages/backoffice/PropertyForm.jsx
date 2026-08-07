import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import {
  FiArrowLeft, FiSave, FiUpload, FiX, FiHome, FiMapPin,
  FiDollarSign, FiGrid, FiImage, FiInfo
} from 'react-icons/fi'
import { DIRHAM_SYMBOL } from '../../utils/currency'
import DirIcon from '../../components/common/DirIcon'
import api from '../../services/api'

const backofficeService = {
  getProperty: async (id) => {
    const { data } = await api.get(`/backoffice/properties/${id}`)
    return data
  },
  createProperty: async (data) => {
    const { data: res } = await api.post('/backoffice/properties', data)
    return res
  },
  updateProperty: async ({ id, data }) => {
    const { data: res } = await api.put(`/backoffice/properties/${id}`, data)
    return res
  }
}

// Libellés via t('backoffice:crm.shared.propertyTypes'), keyés sur l'enum API.
const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'land', 'commercial', 'office']

// Libellés via t('backoffice:crm.shared.listingTypes'), keyés sur l'enum API.
const LISTING_TYPES = ['sale', 'rent']

// Statut du formulaire (sous-ensemble de crm.properties.status, libellés propres au
// contexte de saisie) : libellés via t('backoffice:crm.properties.form.statusOptions').
const STATUS_OPTIONS = ['draft', 'active', 'pending']

// Noms de villes : données de référence, non traduites (cohérent avec ClientForm.jsx).
const CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Fès', 'Agadir',
  'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Mohammedia'
]

// Équipements : valeurs = libellés stockés tels quels côté API, non traduits
// (cohérent avec le traitement des CITIES ci-dessus).
const FEATURES = [
  'Parking', 'Garage', 'Ascenseur', 'Piscine', 'Jardin', 'Terrasse',
  'Balcon', 'Cave', 'Climatisation', 'Chauffage central', 'Sécurité 24/7',
  'Concierge', 'Interphone', 'Digicode', 'Meublé', 'Cuisine équipée'
]

export default function BackofficePropertyForm() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = !!id

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    property_type: 'apartment',
    listing_type: 'sale',
    price: '',
    surface: '',
    rooms: '',
    bedrooms: '',
    bathrooms: '',
    floor: '',
    total_floors: '',
    year_built: '',
    address: '',
    city: '',
    neighborhood: '',
    postal_code: '',
    latitude: '',
    longitude: '',
    features: [],
    status: 'draft',
    is_featured: false
  })

  const [images, setImages] = useState([])
  const [errors, setErrors] = useState({})

  const { data: propertyData, isLoading: loadingProperty } = useQuery(
    ['backoffice-property', id],
    () => backofficeService.getProperty(id),
    { enabled: isEditing }
  )

  useEffect(() => {
    if (propertyData) {
      setFormData({
        title: propertyData.title || '',
        description: propertyData.description || '',
        property_type: propertyData.property_type || 'apartment',
        listing_type: propertyData.listing_type || 'sale',
        price: propertyData.price || '',
        surface: propertyData.surface || '',
        rooms: propertyData.rooms || '',
        bedrooms: propertyData.bedrooms || '',
        bathrooms: propertyData.bathrooms || '',
        floor: propertyData.floor || '',
        total_floors: propertyData.total_floors || '',
        year_built: propertyData.year_built || '',
        address: propertyData.address || '',
        city: propertyData.city || '',
        neighborhood: propertyData.neighborhood || '',
        postal_code: propertyData.postal_code || '',
        latitude: propertyData.latitude || '',
        longitude: propertyData.longitude || '',
        features: propertyData.features || [],
        status: propertyData.status || 'draft',
        is_featured: propertyData.is_featured || false
      })
      if (propertyData.images) {
        setImages(propertyData.images)
      }
    }
  }, [propertyData])

  const createMutation = useMutation(backofficeService.createProperty, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-properties')
      navigate('/backoffice/biens')
    }
  })

  const updateMutation = useMutation(backofficeService.updateProperty, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-properties')
      queryClient.invalidateQueries(['backoffice-property', id])
      navigate('/backoffice/biens')
    }
  })

  const validate = () => {
    const newErrors = {}
    if (!formData.title) newErrors.title = t('backoffice:crm.properties.form.validation.titleRequired')
    if (!formData.price) newErrors.price = t('backoffice:crm.properties.form.validation.priceRequired')
    if (!formData.city) newErrors.city = t('backoffice:crm.properties.form.validation.cityRequired')
    if (!formData.surface) newErrors.surface = t('backoffice:crm.properties.form.validation.surfaceRequired')
    if (images.length === 0) newErrors.images = t('backoffice:crm.properties.form.validation.imagesRequired')
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) {
      if (images.length === 0) {
        toast.error(t('backoffice:crm.properties.form.toastImagesRequired'))
      }
      return
    }

    const data = {
      ...formData,
      price: parseFloat(formData.price),
      surface: parseFloat(formData.surface),
      rooms: formData.rooms ? parseInt(formData.rooms) : null,
      bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : null,
      bathrooms: formData.bathrooms ? parseInt(formData.bathrooms) : null,
      floor: formData.floor ? parseInt(formData.floor) : null,
      total_floors: formData.total_floors ? parseInt(formData.total_floors) : null,
      year_built: formData.year_built ? parseInt(formData.year_built) : null,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null
    }

    if (isEditing) {
      updateMutation.mutate({ id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const toggleFeature = (feature) => {
    const features = formData.features.includes(feature)
      ? formData.features.filter(f => f !== feature)
      : [...formData.features, feature]
    setFormData({ ...formData, features })
  }

  if (loadingProperty) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/backoffice/biens')}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <DirIcon icon={FiArrowLeft} className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? t('backoffice:crm.properties.form.titleEdit') : t('backoffice:crm.properties.form.titleNew')}
          </h1>
          <p className="text-gray-500">
            {isEditing ? t('backoffice:crm.properties.form.subtitleEdit') : t('backoffice:crm.properties.form.subtitleNew')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiHome className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.properties.form.sections.generalInfo')}
          </h2>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:crm.properties.form.fields.title')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.title ? 'border-red-500' : 'border-gray-200'
                  }`}
                  placeholder={t('backoffice:crm.properties.form.fields.titlePlaceholder')}
                />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
              </div>

              <div className="flex items-center gap-2 sm:pt-6 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.is_featured}
                  onClick={() => setFormData({ ...formData, is_featured: !formData.is_featured })}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                    formData.is_featured ? 'bg-primary-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      formData.is_featured ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-gray-700">{t('backoffice:crm.properties.form.fields.featured')}</span>
                <span
                  className="relative group inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                  tabIndex={0}
                >
                  <FiInfo
                    className="w-4 h-4"
                    title={t('backoffice:crm.properties.form.fields.featuredTooltip')}
                  />
                  <span className="pointer-events-none absolute end-0 bottom-full mb-2 hidden w-56 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus:block z-10">
                    {t('backoffice:crm.properties.form.fields.featuredTooltip')}
                  </span>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.properties.form.fields.description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('backoffice:crm.properties.form.fields.descriptionPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:crm.properties.form.fields.propertyType')}
                </label>
                <select
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {PROPERTY_TYPES.map(type => (
                    <option key={type} value={type}>{t(`backoffice:crm.shared.propertyTypes.${type}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:crm.properties.form.fields.listingType')}
                </label>
                <select
                  value={formData.listing_type}
                  onChange={(e) => setFormData({ ...formData, listing_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {LISTING_TYPES.map(type => (
                    <option key={type} value={type}>{t(`backoffice:crm.shared.listingTypes.${type}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:crm.properties.form.fields.status')}
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>{t(`backoffice:crm.properties.form.statusOptions.${status}`)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Price & Surface */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiDollarSign className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.properties.form.sections.priceSurface')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.properties.form.fields.price', { currency: DIRHAM_SYMBOL })} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.price ? 'border-red-500' : 'border-gray-200'
                }`}
              />
              {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.properties.form.fields.surface')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.surface}
                onChange={(e) => setFormData({ ...formData, surface: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.surface ? 'border-red-500' : 'border-gray-200'
                }`}
              />
              {errors.surface && <p className="text-red-500 text-xs mt-1">{errors.surface}</p>}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiGrid className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.properties.form.sections.features')}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.rooms')}</label>
              <input
                type="number"
                value={formData.rooms}
                onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.bedrooms')}</label>
              <input
                type="number"
                value={formData.bedrooms}
                onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.bathrooms')}</label>
              <input
                type="number"
                value={formData.bathrooms}
                onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.yearBuilt')}</label>
              <input
                type="number"
                value={formData.year_built}
                onChange={(e) => setFormData({ ...formData, year_built: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.floor')}</label>
              <input
                type="number"
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.totalFloors')}</label>
              <input
                type="number"
                value={formData.total_floors}
                onChange={(e) => setFormData({ ...formData, total_floors: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('backoffice:crm.properties.form.fields.featuresLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {FEATURES.map(feature => (
                <button
                  key={feature}
                  type="button"
                  onClick={() => toggleFeature(feature)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    formData.features.includes(feature)
                      ? 'bg-primary-100 text-primary-700 border border-primary-300'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {feature}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiMapPin className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.properties.form.sections.location')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.address')}</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.properties.form.fields.city')} <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.city ? 'border-red-500' : 'border-gray-200'
                }`}
              >
                <option value="">{t('backoffice:crm.properties.form.fields.selectCity')}</option>
                {CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.neighborhood')}</label>
              <input
                type="text"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.latitude')}</label>
              <input
                type="text"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('backoffice:crm.properties.form.fields.latitudePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.properties.form.fields.longitude')}</label>
              <input
                type="text"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('backoffice:crm.properties.form.fields.longitudePlaceholder')}
              />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <FiImage className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.properties.form.sections.photos')} <span className="text-red-500">*</span>
          </h2>
          <p className="text-xs text-gray-400 mb-4">{t('backoffice:crm.properties.form.fields.photosHint')}</p>
          {errors.images && <p className="text-red-500 text-xs mb-4">{errors.images}</p>}

          {images.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {images.map((img, i) => (
                <div key={i} className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                    className="absolute top-2 end-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <FiUpload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">{t('backoffice:crm.properties.form.fields.dragImages')}</p>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer transition-colors">
              <FiUpload className="w-5 h-5" />
              {t('backoffice:crm.properties.form.fields.browse')}
              <input type="file" multiple accept="image/*" className="hidden" />
            </label>
            <p className="text-xs text-gray-400 mt-2">{t('backoffice:crm.properties.form.fields.uploadHint')}</p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/backoffice/biens')}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('backoffice:crm.properties.form.cancelButton')}
          </button>
          <button
            type="submit"
            disabled={createMutation.isLoading || updateMutation.isLoading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <FiSave className="w-5 h-5" />
            {isEditing ? t('backoffice:crm.properties.form.updateButton') : t('backoffice:crm.properties.form.createButton')}
          </button>
        </div>
      </form>
    </div>
  )
}
