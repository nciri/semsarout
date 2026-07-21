import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  FiArrowLeft, FiArrowRight, FiCheck, FiPlus, FiTrash2, FiMapPin,
  FiHome, FiImage, FiFile, FiVideo, FiSave, FiEye, FiX
} from 'react-icons/fi'
import { DIRHAM_SYMBOL, formatPrice } from '../../utils/currency'

const programsService = {
  getProgram: async (id) => {
    const response = await fetch(`/api/v1/programs/my?id=${id}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to fetch program')
    const data = await response.json()
    return data.programs.find(p => p.id === parseInt(id))
  },
  createProgram: async (data) => {
    const response = await fetch('/api/v1/programs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create program')
    }
    return response.json()
  },
  updateProgram: async ({ id, data }) => {
    const response = await fetch(`/api/v1/programs/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update program')
    }
    return response.json()
  },
  addUnit: async ({ programId, data }) => {
    const response = await fetch(`/api/v1/programs/${programId}/units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to add unit')
    return response.json()
  },
  updateUnit: async ({ programId, unitId, data }) => {
    const response = await fetch(`/api/v1/programs/${programId}/units/${unitId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to update unit')
    return response.json()
  },
  deleteUnit: async ({ programId, unitId }) => {
    const response = await fetch(`/api/v1/programs/${programId}/units/${unitId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to delete unit')
    return response.json()
  },
  addImage: async ({ programId, data }) => {
    const response = await fetch(`/api/v1/programs/${programId}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to add image')
    return response.json()
  },
  deleteImage: async ({ programId, imageId }) => {
    const response = await fetch(`/api/v1/programs/${programId}/images/${imageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to delete image')
    return response.json()
  },
  publishProgram: async (id) => {
    const response = await fetch(`/api/v1/programs/${id}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to publish program')
    }
    return response.json()
  }
}

const STEPS = [
  { id: 1, title: 'Informations', icon: FiFile },
  { id: 2, title: 'Localisation', icon: FiMapPin },
  { id: 3, title: 'Détails', icon: FiHome },
  { id: 4, title: 'Types de biens', icon: FiPlus },
  { id: 5, title: 'Médias', icon: FiImage }
]

const PROGRAM_TYPES = [
  { value: 'residential', label: 'Résidentiel' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed', label: 'Mixte' }
]

const CONSTRUCTION_STATUSES = [
  { value: 'planning', label: 'En projet' },
  { value: 'under_construction', label: 'En construction' },
  { value: 'delivered', label: 'Livré' }
]

const UNIT_TYPES = [
  { value: 'studio', label: 'Studio' },
  { value: 'apartment', label: 'Appartement' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'villa', label: 'Villa' },
  { value: 'penthouse', label: 'Penthouse' },
  { value: 'commercial', label: 'Local commercial' }
]

const AMENITIES_OPTIONS = [
  { value: 'pool', label: 'Piscine' },
  { value: 'gym', label: 'Salle de sport' },
  { value: 'security', label: 'Sécurité 24h' },
  { value: 'parking', label: 'Parking' },
  { value: 'garden', label: 'Jardin' },
  { value: 'playground', label: 'Aire de jeux' },
  { value: 'concierge', label: 'Conciergerie' },
  { value: 'elevator', label: 'Ascenseur' },
  { value: 'terrace', label: 'Terrasse' },
  { value: 'spa', label: 'Spa' }
]

const IMAGE_TYPES = [
  { value: 'exterior', label: 'Extérieur' },
  { value: 'interior', label: 'Intérieur' },
  { value: 'amenity', label: 'Équipements' },
  { value: 'plan', label: 'Plan' }
]

function UnitForm({ unit, onSave, onCancel, isNew = false }) {
  const [formData, setFormData] = useState(unit || {
    name: '',
    unit_type: 'apartment',
    surface_min: '',
    surface_max: '',
    rooms: '',
    bedrooms: '',
    bathrooms: '',
    price_from: '',
    price_to: '',
    total_count: '',
    available_count: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom du type *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ex: Appartement T3"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type de bien</label>
          <select
            value={formData.unit_type}
            onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {UNIT_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Surface min (m²)</label>
          <input
            type="number"
            value={formData.surface_min}
            onChange={(e) => setFormData({ ...formData, surface_min: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Surface max (m²)</label>
          <input
            type="number"
            value={formData.surface_max}
            onChange={(e) => setFormData({ ...formData, surface_max: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pièces</label>
          <input
            type="number"
            value={formData.rooms}
            onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chambres</label>
          <input
            type="number"
            value={formData.bedrooms}
            onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prix à partir de ({DIRHAM_SYMBOL})</label>
          <input
            type="number"
            value={formData.price_from}
            onChange={(e) => setFormData({ ...formData, price_from: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prix jusqu'à ({DIRHAM_SYMBOL})</label>
          <input
            type="number"
            value={formData.price_to}
            onChange={(e) => setFormData({ ...formData, price_to: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre total</label>
          <input
            type="number"
            value={formData.total_count}
            onChange={(e) => setFormData({ ...formData, total_count: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Disponibles</label>
          <input
            type="number"
            value={formData.available_count}
            onChange={(e) => setFormData({ ...formData, available_count: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          {isNew ? 'Ajouter' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

export default function DashboardProgramForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = Boolean(id)

  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    program_type: 'residential',
    address: '',
    city: '',
    neighborhood: '',
    latitude: null,
    longitude: null,
    delivery_date: '',
    construction_status: 'planning',
    amenities: [],
    cover_image_url: '',
    brochure_url: '',
    video_url: ''
  })
  const [units, setUnits] = useState([])
  const [images, setImages] = useState([])
  const [showUnitForm, setShowUnitForm] = useState(false)
  const [editingUnit, setEditingUnit] = useState(null)
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newImageType, setNewImageType] = useState('exterior')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [programId, setProgramId] = useState(id ? parseInt(id) : null)

  // Fetch program if editing
  const { data: program, isLoading } = useQuery(
    ['program', id],
    () => programsService.getProgram(id),
    {
      enabled: isEditing,
      onSuccess: (data) => {
        if (data) {
          setFormData({
            name: data.name || '',
            description: data.description || '',
            program_type: data.program_type || 'residential',
            address: data.address || '',
            city: data.city || '',
            neighborhood: data.neighborhood || '',
            latitude: data.latitude,
            longitude: data.longitude,
            delivery_date: data.delivery_date || '',
            construction_status: data.construction_status || 'planning',
            amenities: data.amenities || [],
            cover_image_url: data.cover_image_url || '',
            brochure_url: data.brochure_url || '',
            video_url: data.video_url || ''
          })
          setUnits(data.units || [])
          setImages(data.images || [])
        }
      }
    }
  )

  const createMutation = useMutation(programsService.createProgram, {
    onSuccess: (data) => {
      setProgramId(data.program.id)
      queryClient.invalidateQueries('my-programs')
    }
  })

  const updateMutation = useMutation(programsService.updateProgram, {
    onSuccess: () => {
      queryClient.invalidateQueries(['program', id])
      queryClient.invalidateQueries('my-programs')
    }
  })

  const addUnitMutation = useMutation(programsService.addUnit, {
    onSuccess: (data) => {
      setUnits([...units, data.unit])
      setShowUnitForm(false)
    }
  })

  const updateUnitMutation = useMutation(programsService.updateUnit, {
    onSuccess: (data) => {
      setUnits(units.map(u => u.id === data.unit.id ? data.unit : u))
      setEditingUnit(null)
    }
  })

  const deleteUnitMutation = useMutation(programsService.deleteUnit, {
    onSuccess: (_, variables) => {
      setUnits(units.filter(u => u.id !== variables.unitId))
    }
  })

  const addImageMutation = useMutation(programsService.addImage, {
    onSuccess: (data) => {
      setImages([...images, data.image])
      setNewImageUrl('')
    }
  })

  const deleteImageMutation = useMutation(programsService.deleteImage, {
    onSuccess: (_, variables) => {
      setImages(images.filter(i => i.id !== variables.imageId))
    }
  })

  const publishMutation = useMutation(programsService.publishProgram, {
    onSuccess: () => {
      queryClient.invalidateQueries('my-programs')
      navigate('/dashboard/programmes')
    }
  })

  const handleSaveStep = async () => {
    setSaving(true)
    setError('')

    try {
      if (!programId) {
        // Create new program
        const result = await createMutation.mutateAsync(formData)
        setProgramId(result.program.id)
      } else {
        // Update existing program
        await updateMutation.mutateAsync({ id: programId, data: formData })
      }
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleNextStep = async () => {
    if (currentStep === 1 && !formData.name) {
      setError('Le nom du programme est requis')
      return
    }

    const success = await handleSaveStep()
    if (success && currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleAddUnit = async (unitData) => {
    if (!programId) {
      setError('Veuillez d\'abord sauvegarder les informations de base')
      return
    }
    await addUnitMutation.mutateAsync({ programId, data: unitData })
  }

  const handleUpdateUnit = async (unitData) => {
    await updateUnitMutation.mutateAsync({ programId, unitId: editingUnit.id, data: unitData })
  }

  const handleDeleteUnit = async (unitId) => {
    if (window.confirm('Supprimer ce type de bien ?')) {
      await deleteUnitMutation.mutateAsync({ programId, unitId })
    }
  }

  const handleAddImage = async () => {
    if (!newImageUrl.trim()) return
    if (!programId) {
      setError('Veuillez d\'abord sauvegarder les informations de base')
      return
    }
    await addImageMutation.mutateAsync({
      programId,
      data: { url: newImageUrl, image_type: newImageType }
    })
  }

  const handleDeleteImage = async (imageId) => {
    if (window.confirm('Supprimer cette image ?')) {
      await deleteImageMutation.mutateAsync({ programId, imageId })
    }
  }

  const handlePublish = async () => {
    if (!programId) {
      setError('Veuillez d\'abord sauvegarder le programme')
      return
    }
    try {
      await publishMutation.mutateAsync(programId)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleAmenity = (amenity) => {
    if (formData.amenities.includes(amenity)) {
      setFormData({ ...formData, amenities: formData.amenities.filter(a => a !== amenity) })
    } else {
      setFormData({ ...formData, amenities: [...formData.amenities, amenity] })
    }
  }

  if (isEditing && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/dashboard/programmes"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <FiArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Modifier le programme' : 'Nouveau programme'}
          </h1>
          <p className="text-gray-500">
            {isEditing ? formData.name : 'Créez un nouveau projet immobilier'}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon
          const isActive = currentStep === step.id
          const isCompleted = currentStep > step.id

          return (
            <div key={step.id} className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <button
                onClick={() => programId && setCurrentStep(step.id)}
                disabled={!programId && step.id !== 1}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-primary-100 text-primary-700'
                    : isCompleted
                    ? 'bg-green-100 text-green-700'
                    : 'text-gray-400'
                } ${(!programId && step.id !== 1) ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : isCompleted
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {isCompleted ? <FiCheck className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                </div>
                <span className="hidden sm:inline font-medium">{step.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-600' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error === 'Agence requise' ? (
            <>
              Vous devez d'abord créer votre agence pour publier un programme.{' '}
              <Link to="/dashboard/agence" className="underline font-medium">
                Créer mon agence
              </Link>
            </>
          ) : error.includes('nécessite le plan Pro') ? (
            <>
              {error}{' '}
              <Link to="/dashboard/abonnement" className="underline font-medium">
                Voir les abonnements
              </Link>
            </>
          ) : (
            error
          )}
        </div>
      )}

      {/* Step content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {/* Step 1: General Info */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Informations générales</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du programme *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Résidence Les Jardins de Casablanca"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type de programme
              </label>
              <select
                value={formData.program_type}
                onChange={(e) => setFormData({ ...formData, program_type: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {PROGRAM_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Décrivez votre programme immobilier..."
                rows={5}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Localisation</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ville *
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Ex: Casablanca"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quartier
                </label>
                <input
                  type="text"
                  value={formData.neighborhood}
                  onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                  placeholder="Ex: Anfa"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse complète
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Adresse du projet"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.latitude || ''}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="33.5731"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.longitude || ''}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="-7.5898"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Project Details */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Détails du projet</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de livraison prévue
                </label>
                <input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  État de construction
                </label>
                <select
                  value={formData.construction_status}
                  onChange={(e) => setFormData({ ...formData, construction_status: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {CONSTRUCTION_STATUSES.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Équipements et services
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {AMENITIES_OPTIONS.map(amenity => (
                  <button
                    key={amenity.value}
                    type="button"
                    onClick={() => toggleAmenity(amenity.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      formData.amenities.includes(amenity.value)
                        ? 'bg-primary-100 text-primary-700 border-2 border-primary-500'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    {amenity.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Units */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Types de biens</h2>
              {!showUnitForm && !editingUnit && (
                <button
                  onClick={() => setShowUnitForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <FiPlus className="w-4 h-4" />
                  Ajouter un type
                </button>
              )}
            </div>

            {/* Unit form */}
            {showUnitForm && (
              <UnitForm
                isNew
                onSave={handleAddUnit}
                onCancel={() => setShowUnitForm(false)}
              />
            )}

            {editingUnit && (
              <UnitForm
                unit={editingUnit}
                onSave={handleUpdateUnit}
                onCancel={() => setEditingUnit(null)}
              />
            )}

            {/* Units list */}
            {units.length > 0 ? (
              <div className="space-y-3">
                {units.map(unit => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{unit.name}</p>
                      <p className="text-sm text-gray-500">
                        {unit.surface_min && `${unit.surface_min} - ${unit.surface_max || unit.surface_min} m²`}
                        {unit.price_from && ` • À partir de ${formatPrice(unit.price_from)}`}
                        {unit.total_count && ` • ${unit.available_count || 0}/${unit.total_count} disponibles`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingUnit(unit)}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg"
                      >
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUnit(unit.id)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-lg"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !showUnitForm && (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <FiHome className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Aucun type de bien ajouté</p>
                  <p className="text-sm text-gray-400">Ajoutez les différents types de biens disponibles dans ce programme</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Step 5: Media */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Médias</h2>

            {/* Cover image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image de couverture
              </label>
              <input
                type="url"
                value={formData.cover_image_url}
                onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
                placeholder="URL de l'image de couverture"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {formData.cover_image_url && (
                <div className="mt-2 w-48 h-32 rounded-lg overflow-hidden bg-gray-100">
                  <img src={formData.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* Gallery */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Galerie d'images
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="URL de l'image"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <select
                  value={newImageType}
                  onChange={(e) => setNewImageType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {IMAGE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddImage}
                  disabled={!newImageUrl.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  <FiPlus className="w-5 h-5" />
                </button>
              </div>

              {images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {images.map(image => (
                    <div key={image.id} className="relative group">
                      <img
                        src={image.url}
                        alt={image.caption || 'Program image'}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => handleDeleteImage(image.id)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <FiX className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 text-xs bg-black/50 text-white px-1 rounded">
                        {IMAGE_TYPES.find(t => t.value === image.image_type)?.label || image.image_type}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <FiImage className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Aucune image dans la galerie</p>
                </div>
              )}
            </div>

            {/* Brochure & Video */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiFile className="inline w-4 h-4 mr-1" />
                  Brochure (URL PDF)
                </label>
                <input
                  type="url"
                  value={formData.brochure_url}
                  onChange={(e) => setFormData({ ...formData, brochure_url: e.target.value })}
                  placeholder="URL de la brochure PDF"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiVideo className="inline w-4 h-4 mr-1" />
                  Vidéo (URL YouTube)
                </label>
                <input
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder="URL de la vidéo"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            onClick={handlePrevStep}
            disabled={currentStep === 1}
            className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiArrowLeft className="w-5 h-5" />
            Précédent
          </button>

          <div className="flex items-center gap-3">
            {currentStep === STEPS.length ? (
              <>
                <button
                  onClick={handleSaveStep}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <FiSave className="w-5 h-5" />
                  Enregistrer
                </button>
                <button
                  onClick={handlePublish}
                  disabled={saving || publishMutation.isLoading}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <FiEye className="w-5 h-5" />
                  Publier le programme
                </button>
              </>
            ) : (
              <button
                onClick={handleNextStep}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Suivant'}
                <FiArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
