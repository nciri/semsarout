import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  FiArrowLeft, FiSave, FiUpload, FiX, FiHome, FiMapPin,
  FiDollarSign, FiGrid, FiImage
} from 'react-icons/fi'
import { DIRHAM_SYMBOL } from '../../utils/currency'

const backofficeService = {
  getProperty: async (id) => {
    const response = await fetch(`/api/v1/backoffice/properties/${id}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to fetch property')
    return response.json()
  },
  createProperty: async (data) => {
    const response = await fetch('/api/v1/backoffice/properties', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to create property')
    return response.json()
  },
  updateProperty: async ({ id, data }) => {
    const response = await fetch(`/api/v1/backoffice/properties/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to update property')
    return response.json()
  }
}

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Appartement' },
  { value: 'house', label: 'Maison' },
  { value: 'villa', label: 'Villa' },
  { value: 'land', label: 'Terrain' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'office', label: 'Bureau' }
]

const LISTING_TYPES = [
  { value: 'sale', label: 'Vente' },
  { value: 'rent', label: 'Location' }
]

const CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Fès', 'Agadir',
  'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Mohammedia'
]

export default function BackofficePropertyForm() {
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
    status: 'draft'
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
        status: propertyData.status || 'draft'
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
    if (!formData.title) newErrors.title = 'Le titre est requis'
    if (!formData.price) newErrors.price = 'Le prix est requis'
    if (!formData.city) newErrors.city = 'La ville est requise'
    if (!formData.surface) newErrors.surface = 'La surface est requise'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

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

  const FEATURES = [
    'Parking', 'Garage', 'Ascenseur', 'Piscine', 'Jardin', 'Terrasse',
    'Balcon', 'Cave', 'Climatisation', 'Chauffage central', 'Sécurité 24/7',
    'Concierge', 'Interphone', 'Digicode', 'Meublé', 'Cuisine équipée'
  ]

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
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Modifier le bien' : 'Nouveau bien'}
          </h1>
          <p className="text-gray-500">
            {isEditing ? 'Mettez à jour les informations du bien' : 'Ajoutez un nouveau bien à votre portefeuille'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiHome className="w-5 h-5 text-gray-400" />
            Informations générales
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Titre de l'annonce <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.title ? 'border-red-500' : 'border-gray-200'
                }`}
                placeholder="Ex: Appartement 3 pièces avec vue mer"
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Décrivez le bien en détail..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type de bien
                </label>
                <select
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {PROPERTY_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type d'annonce
                </label>
                <select
                  value={formData.listing_type}
                  onChange={(e) => setFormData({ ...formData, listing_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {LISTING_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Statut
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="draft">Brouillon</option>
                  <option value="active">Publié</option>
                  <option value="pending">En attente</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Price & Surface */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiDollarSign className="w-5 h-5 text-gray-400" />
            Prix et surface
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix ({DIRHAM_SYMBOL}) <span className="text-red-500">*</span>
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
                Surface (m²) <span className="text-red-500">*</span>
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
            Caractéristiques
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pièces</label>
              <input
                type="number"
                value={formData.rooms}
                onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chambres</label>
              <input
                type="number"
                value={formData.bedrooms}
                onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salles de bain</label>
              <input
                type="number"
                value={formData.bathrooms}
                onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Année de construction</label>
              <input
                type="number"
                value={formData.year_built}
                onChange={(e) => setFormData({ ...formData, year_built: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Étage</label>
              <input
                type="number"
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre d'étages</label>
              <input
                type="number"
                value={formData.total_floors}
                onChange={(e) => setFormData({ ...formData, total_floors: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Équipements</label>
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
            Localisation
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ville <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.city ? 'border-red-500' : 'border-gray-200'
                }`}
              >
                <option value="">Sélectionner une ville</option>
                {CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quartier</label>
              <input
                type="text"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input
                type="text"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ex: 33.5731"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input
                type="text"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ex: -7.5898"
              />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiImage className="w-5 h-5 text-gray-400" />
            Photos
          </h2>

          {images.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {images.map((img, i) => (
                <div key={i} className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <FiUpload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">Glissez vos images ici ou</p>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer transition-colors">
              <FiUpload className="w-5 h-5" />
              Parcourir
              <input type="file" multiple accept="image/*" className="hidden" />
            </label>
            <p className="text-xs text-gray-400 mt-2">PNG, JPG jusqu'à 10MB</p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/backoffice/biens')}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={createMutation.isLoading || updateMutation.isLoading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <FiSave className="w-5 h-5" />
            {isEditing ? 'Mettre à jour' : 'Créer le bien'}
          </button>
        </div>
      </form>
    </div>
  )
}
