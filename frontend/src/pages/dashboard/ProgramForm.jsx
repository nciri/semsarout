import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiArrowLeft, FiArrowRight, FiCheck, FiPlus, FiTrash2, FiMapPin,
  FiHome, FiImage, FiFile, FiVideo, FiSave, FiEye, FiX, FiEdit2
} from 'react-icons/fi'
import DirIcon from '../../components/common/DirIcon'
import { DIRHAM_SYMBOL, formatPrice } from '../../utils/currency'
import api from '../../services/api'
import SpecFields from '../../components/common/SpecFields'
import AddressAutocomplete from '../../components/common/AddressAutocomplete'
import { TYPOLOGY_OPTIONS, unitTypesForTypology, DETAIL_SECTIONS, UNIT_SPEC_FIELDS, UNIT_HIDE_ROOMS } from './programSpecsConfig'
import i18n from '../../i18n'

// Route through the shared axios instance: it reads accessToken from
// auth-storage and auto-refreshes on 401, avoiding the stale-token desync that
// a separate localStorage 'token' + raw fetch would cause.
const unwrap = (res) => res.data
const asError = (fallback) => (err) => {
  throw new Error(err.response?.data?.error || fallback)
}

const programsService = {
  getProgram: async (id) => {
    const { data } = await api.get('/programs/my', { params: { id } })
    return data.programs.find(p => p.id === parseInt(id))
  },
  createProgram: (data) =>
    api.post('/programs', data).then(unwrap, asError(i18n.t('dashboard:programForm.errors.createFailed'))),
  updateProgram: ({ id, data }) =>
    api.put(`/programs/${id}`, data).then(unwrap, asError(i18n.t('dashboard:programForm.errors.updateFailed'))),
  addUnit: ({ programId, data }) =>
    api.post(`/programs/${programId}/units`, data).then(unwrap, asError(i18n.t('dashboard:programForm.errors.addUnitFailed'))),
  updateUnit: ({ programId, unitId, data }) =>
    api.put(`/programs/${programId}/units/${unitId}`, data).then(unwrap, asError(i18n.t('dashboard:programForm.errors.updateUnitFailed'))),
  deleteUnit: ({ programId, unitId }) =>
    api.delete(`/programs/${programId}/units/${unitId}`).then(unwrap, asError(i18n.t('dashboard:programForm.errors.deleteFailed'))),
  addImage: ({ programId, data }) =>
    api.post(`/programs/${programId}/images`, data).then(unwrap, asError(i18n.t('dashboard:programForm.errors.addImageFailed'))),
  deleteImage: ({ programId, imageId }) =>
    api.delete(`/programs/${programId}/images/${imageId}`).then(unwrap, asError(i18n.t('dashboard:programForm.errors.deleteImageFailed'))),
  publishProgram: (id) =>
    api.post(`/programs/${id}/publish`).then(unwrap, asError(i18n.t('dashboard:programForm.errors.publishFailed')))
}

const STEP_DEFS = [
  { id: 1, key: 'info', icon: FiFile },
  { id: 2, key: 'location', icon: FiMapPin },
  { id: 3, key: 'units', icon: FiPlus },
  { id: 4, key: 'details', icon: FiHome },
  { id: 5, key: 'media', icon: FiImage }
]

const PROGRAM_TYPE_VALUES = ['residential', 'commercial', 'mixed']

const CONSTRUCTION_STATUS_VALUES = ['planning', 'under_construction', 'delivered']

const UNIT_TYPE_VALUES = ['studio', 'apartment', 'duplex', 'villa', 'penthouse', 'land', 'commercial']

const AMENITY_VALUES = ['pool', 'gym', 'security', 'parking', 'garden', 'playground', 'concierge', 'elevator', 'terrace', 'spa']

const IMAGE_TYPE_VALUES = ['exterior', 'interior', 'amenity', 'plan']

function UnitForm({ unit, onSave, onCancel, isNew = false, allowedTypes }) {
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
    available_count: '',
    specs: unit?.specs || {}
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  const { t } = useTranslation(['dashboard', 'common'])
  const typeValues = (allowedTypes && allowedTypes.length) ? UNIT_TYPE_VALUES.filter(v => allowedTypes.includes(v)) : UNIT_TYPE_VALUES
  const hideRooms = UNIT_HIDE_ROOMS.includes(formData.unit_type)
  const unitSpecFields = UNIT_SPEC_FIELDS[formData.unit_type] || []

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.name')}</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('dashboard:programForm.unitForm.namePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.unitType')}</label>
          <select
            value={formData.unit_type}
            onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {typeValues.map(value => (
              <option key={value} value={value}>{t(`dashboard:programForm.unitTypes.${value}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.surfaceMin')}</label>
          <input
            type="number"
            value={formData.surface_min}
            onChange={(e) => setFormData({ ...formData, surface_min: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.surfaceMax')}</label>
          <input
            type="number"
            value={formData.surface_max}
            onChange={(e) => setFormData({ ...formData, surface_max: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        {!hideRooms && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.rooms')}</label>
              <input
                type="number"
                value={formData.rooms}
                onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.bedrooms')}</label>
              <input
                type="number"
                value={formData.bedrooms}
                onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.bathrooms')}</label>
              <input
                type="number"
                value={formData.bathrooms}
                onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.priceFrom', { currency: DIRHAM_SYMBOL })}</label>
          <input
            type="number"
            value={formData.price_from}
            onChange={(e) => setFormData({ ...formData, price_from: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.priceTo', { currency: DIRHAM_SYMBOL })}</label>
          <input
            type="number"
            value={formData.price_to}
            onChange={(e) => setFormData({ ...formData, price_to: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.totalCount')}</label>
          <input
            type="number"
            value={formData.total_count}
            onChange={(e) => setFormData({ ...formData, total_count: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programForm.unitForm.availableCount')}</label>
          <input
            type="number"
            value={formData.available_count}
            onChange={(e) => setFormData({ ...formData, available_count: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {unitSpecFields.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('dashboard:programForm.characteristics')}</h4>
          <SpecFields
            fields={unitSpecFields}
            values={formData.specs || {}}
            onChange={(vals) => setFormData({ ...formData, specs: vals })}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          {t('dashboard:shared.actions.cancel')}
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          {isNew ? t('dashboard:shared.actions.add') : t('dashboard:shared.actions.save')}
        </button>
      </div>
    </form>
  )
}

export default function DashboardProgramForm() {
  const { t } = useTranslation(['dashboard', 'common'])
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
    video_url: '',
    specs: {}
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
            video_url: data.video_url || '',
            specs: data.specs || {}
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
      setError(t('dashboard:programForm.errors.nameRequired'))
      return
    }

    const success = await handleSaveStep()
    if (success && currentStep < STEP_DEFS.length) {
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
      setError(t('dashboard:programForm.errors.saveBasicFirst'))
      return
    }
    setError('')
    try {
      await addUnitMutation.mutateAsync({ programId, data: unitData })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpdateUnit = async (unitData) => {
    setError('')
    try {
      await updateUnitMutation.mutateAsync({ programId, unitId: editingUnit.id, data: unitData })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteUnit = async (unitId) => {
    if (window.confirm(t('dashboard:programForm.confirms.deleteUnit'))) {
      try {
        await deleteUnitMutation.mutateAsync({ programId, unitId })
      } catch (err) {
        setError(err.message)
      }
    }
  }

  const handleAddImage = async () => {
    if (!newImageUrl.trim()) return
    if (!programId) {
      setError(t('dashboard:programForm.errors.saveBasicFirst'))
      return
    }
    setError('')
    try {
      await addImageMutation.mutateAsync({
        programId,
        data: { url: newImageUrl, image_type: newImageType }
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteImage = async (imageId) => {
    if (window.confirm(t('dashboard:programForm.confirms.deleteImage'))) {
      try {
        await deleteImageMutation.mutateAsync({ programId, imageId })
      } catch (err) {
        setError(err.message)
      }
    }
  }

  const handlePublish = async () => {
    if (!programId) {
      setError(t('dashboard:programForm.errors.saveProgramFirst'))
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

  const isProPlanError = error.includes('nécessite le plan Pro')

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
          <DirIcon icon={FiArrowLeft} className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? t('dashboard:programForm.titleEdit') : t('dashboard:programForm.titleCreate')}
          </h1>
          <p className="text-gray-500">
            {isEditing ? formData.name : t('dashboard:programForm.subtitle')}
          </p>
        </div>
        {isEditing && (
          <Link
            to={`/dashboard/programmes/${id}/plan`}
            className="ms-auto btn-secondary inline-flex items-center gap-2"
          >
            <FiMapPin className="w-4 h-4" />
            {t('dashboard:programForm.interactivePlan')}
          </Link>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between mb-8">
        {STEP_DEFS.map((step, index) => {
          const StepIcon = step.icon
          const isActive = currentStep === step.id
          const isCompleted = currentStep > step.id

          return (
            <div key={step.id} className={`flex items-center ${index < STEP_DEFS.length - 1 ? 'flex-1' : ''}`}>
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
                <span className="hidden sm:inline font-medium">{t(`dashboard:programForm.steps.${step.key}`)}</span>
              </button>
              {index < STEP_DEFS.length - 1 && (
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
              {t('dashboard:programForm.errors.agencyRequired')}{' '}
              <Link to="/dashboard/agence" className="underline font-medium">
                {t('dashboard:programForm.errors.createAgencyLink')}
              </Link>
            </>
          ) : isProPlanError ? (
            <>
              {error}{' '}
              <Link to="/dashboard/abonnement" className="underline font-medium">
                {t('dashboard:programForm.errors.viewSubscriptionsLink')}
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
            <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:programForm.sections.generalInfo')}</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('dashboard:programForm.fields.programName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('dashboard:programForm.fields.programNamePlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('dashboard:programForm.fields.programType')}
              </label>
              <select
                value={formData.program_type}
                onChange={(e) => setFormData({ ...formData, program_type: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {PROGRAM_TYPE_VALUES.map(value => (
                  <option key={value} value={value}>{t(`dashboard:programs.type.${value}`)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('dashboard:programForm.fields.description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('dashboard:programForm.fields.descriptionPlaceholder')}
                rows={5}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:programForm.sections.location')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('dashboard:programForm.fields.city')}
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
                  {t('dashboard:programForm.fields.neighborhood')}
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

            <AddressAutocomplete
              value={formData.address}
              onChange={(address) => setFormData({ ...formData, address })}
              onSelect={({ address, lat, lng }) =>
                setFormData({ ...formData, address, latitude: lat ?? null, longitude: lng ?? null })
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('dashboard:programForm.fields.latitude')}
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
                  {t('dashboard:programForm.fields.longitude')}
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

        {/* Step 4: Project Details */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:programForm.sections.details')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('dashboard:programForm.fields.deliveryDate')}
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
                  {t('dashboard:programForm.fields.constructionStatus')}
                </label>
                <select
                  value={formData.construction_status}
                  onChange={(e) => setFormData({ ...formData, construction_status: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {CONSTRUCTION_STATUS_VALUES.map(value => (
                    <option key={value} value={value}>{t(`dashboard:programs.constructionStatus.${value}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('dashboard:programForm.fields.amenities')}
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {AMENITY_VALUES.map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleAmenity(value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      formData.amenities.includes(value)
                        ? 'bg-primary-100 text-primary-700 border-2 border-primary-500'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    {t(`dashboard:programForm.amenities.${value}`)}
                  </button>
                ))}
              </div>
            </div>

            {(formData.specs?.typology || []).map((typ) => {
              const section = DETAIL_SECTIONS[typ]
              if (!section) return null
              return (
                <div key={typ} className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t(`dashboard:${section.labelKey}`)}</h3>
                  <SpecFields
                    fields={section.fields}
                    values={formData.specs?.[typ] || {}}
                    onChange={(vals) => setFormData({ ...formData, specs: { ...formData.specs, [typ]: vals } })}
                  />
                </div>
              )
            })}
            {(!formData.specs?.typology || formData.specs.typology.length === 0) && (
              <p className="text-sm text-gray-400">{t('dashboard:programForm.selectTypologyHint')}</p>
            )}
          </div>
        )}

        {/* Step 3: Units */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:programForm.fields.typology')}</label>
              <div className="flex flex-wrap gap-2">
                {TYPOLOGY_OPTIONS.map((opt) => {
                  const selected = (formData.specs?.typology || []).includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const cur = formData.specs?.typology || []
                        const next = selected ? cur.filter((tv) => tv !== opt.value) : [...cur, opt.value]
                        setFormData({ ...formData, specs: { ...formData.specs, typology: next } })
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selected ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {t(`dashboard:${opt.labelKey}`)}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard:programForm.typologyHint')}</p>
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:programForm.sections.units')}</h2>
              {!showUnitForm && !editingUnit && (
                <button
                  onClick={() => setShowUnitForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <FiPlus className="w-4 h-4" />
                  {t('dashboard:programForm.addUnitType')}
                </button>
              )}
            </div>

            {/* Unit form */}
            {showUnitForm && (
              <UnitForm
                isNew
                onSave={handleAddUnit}
                onCancel={() => setShowUnitForm(false)}
                allowedTypes={unitTypesForTypology(formData.specs?.typology || [])}
              />
            )}

            {editingUnit && (
              <UnitForm
                unit={editingUnit}
                onSave={handleUpdateUnit}
                onCancel={() => setEditingUnit(null)}
                allowedTypes={unitTypesForTypology(formData.specs?.typology || [])}
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
                        {unit.price_from && ` • ${t('dashboard:programs.startingFrom', { price: formatPrice(unit.price_from) })}`}
                        {unit.total_count && ` • ${t('dashboard:programForm.availableOfTotal', { available: unit.available_count || 0, total: unit.total_count })}`}
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
                  <p className="text-gray-500">{t('dashboard:programForm.noUnitType')}</p>
                  <p className="text-sm text-gray-400">{t('dashboard:programForm.noUnitTypeHint')}</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Step 5: Media */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:programForm.sections.media')}</h2>

            {/* Cover image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('dashboard:programForm.fields.coverImage')}
              </label>
              <input
                type="url"
                value={formData.cover_image_url}
                onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
                placeholder={t('dashboard:programForm.fields.coverImagePlaceholder')}
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
                {t('dashboard:programForm.fields.gallery')}
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder={t('dashboard:programForm.fields.imageUrlPlaceholder')}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <select
                  value={newImageType}
                  onChange={(e) => setNewImageType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {IMAGE_TYPE_VALUES.map(value => (
                    <option key={value} value={value}>{t(`dashboard:programForm.imageTypes.${value}`)}</option>
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
                        className="absolute top-1 end-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <FiX className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 start-1 text-xs bg-black/50 text-white px-1 rounded">
                        {t(`dashboard:programForm.imageTypes.${image.image_type}`, { defaultValue: image.image_type })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <FiImage className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">{t('dashboard:programForm.noGalleryImage')}</p>
                </div>
              )}
            </div>

            {/* Brochure & Video */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiFile className="inline w-4 h-4 me-1" />
                  {t('dashboard:programForm.fields.brochure')}
                </label>
                <input
                  type="url"
                  value={formData.brochure_url}
                  onChange={(e) => setFormData({ ...formData, brochure_url: e.target.value })}
                  placeholder={t('dashboard:programForm.fields.brochurePlaceholder')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiVideo className="inline w-4 h-4 me-1" />
                  {t('dashboard:programForm.fields.video')}
                </label>
                <input
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder={t('dashboard:programForm.fields.videoPlaceholder')}
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
            <DirIcon icon={FiArrowLeft} className="w-5 h-5" />
            {t('dashboard:programs.pagination.previous')}
          </button>

          <div className="flex items-center gap-3">
            {currentStep === STEP_DEFS.length ? (
              <>
                <button
                  onClick={handleSaveStep}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <FiSave className="w-5 h-5" />
                  {t('dashboard:shared.actions.save')}
                </button>
                <button
                  onClick={handlePublish}
                  disabled={saving || publishMutation.isLoading}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <FiEye className="w-5 h-5" />
                  {t('dashboard:programForm.publishButton')}
                </button>
              </>
            ) : (
              <button
                onClick={handleNextStep}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? t('dashboard:shared.actions.saving') : t('dashboard:programs.pagination.next')}
                <DirIcon icon={FiArrowRight} className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
