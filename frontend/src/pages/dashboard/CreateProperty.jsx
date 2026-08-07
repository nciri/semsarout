import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiSave } from 'react-icons/fi'
import { propertyService } from '../../services/propertyService'
import { DIRHAM_SYMBOL } from '../../utils/currency'
import { getAmenityIcon } from '../../utils/amenityIcons'

const PROPERTY_TYPE_VALUES = ['apartment', 'house', 'villa', 'land', 'commercial', 'office']

// Valeurs envoyées telles quelles à l'API (données FR, non traduites).
const FEATURES = [
  'Parking', 'Garage', 'Balcon', 'Terrasse', 'Jardin',
  'Piscine', 'Ascenseur', 'Climatisation', 'Chauffage central',
  'Gardien', 'Interphone', 'Meublé', 'Cuisine équipée'
]

function CreateProperty() {
  const { t } = useTranslation(['dashboard', 'common'])
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditMode = Boolean(id)
  const [selectedFeatures, setSelectedFeatures] = useState([])

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      transaction_type: 'sale',
      property_type: 'apartment'
    }
  })

  const transactionType = watch('transaction_type')

  const { data: existingProperty, isLoading: isLoadingProperty } = useQuery(
    ['property', id],
    () => propertyService.getProperty(id),
    { enabled: isEditMode }
  )

  useEffect(() => {
    if (existingProperty) {
      reset({
        title: existingProperty.title,
        transaction_type: existingProperty.transaction_type,
        property_type: existingProperty.property_type,
        description: existingProperty.description,
        price: existingProperty.price,
        surface: existingProperty.surface,
        rooms: existingProperty.rooms,
        bedrooms: existingProperty.bedrooms,
        bathrooms: existingProperty.bathrooms,
        floor: existingProperty.floor,
        city: existingProperty.city,
        neighborhood: existingProperty.neighborhood,
        address: existingProperty.address
      })
      setSelectedFeatures(existingProperty.features || [])
    }
  }, [existingProperty, reset])

  const createMutation = useMutation(
    (data) => propertyService.createProperty(data),
    {
      onSuccess: () => {
        toast.success(t('dashboard:createProperty.toasts.created'))
        navigate('/dashboard/annonces')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || t('dashboard:createProperty.toasts.createError'))
      }
    }
  )

  const updateMutation = useMutation(
    (data) => propertyService.updateProperty(id, data),
    {
      onSuccess: () => {
        toast.success(t('dashboard:createProperty.toasts.updated'))
        navigate('/dashboard/annonces')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || t('dashboard:createProperty.toasts.updateError'))
      }
    }
  )

  const toggleFeature = (feature) => {
    setSelectedFeatures(prev =>
      prev.includes(feature)
        ? prev.filter(f => f !== feature)
        : [...prev, feature]
    )
  }

  const onSubmit = (data) => {
    const payload = {
      ...data,
      features: selectedFeatures,
      price: parseFloat(data.price),
      surface: data.surface ? parseFloat(data.surface) : null,
      rooms: data.rooms ? parseInt(data.rooms) : null,
      bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
      bathrooms: data.bathrooms ? parseInt(data.bathrooms) : null
    }

    if (isEditMode) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const isSaving = createMutation.isLoading || updateMutation.isLoading

  if (isEditMode && isLoadingProperty) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">
          {isEditMode ? t('dashboard:createProperty.titleEdit') : t('dashboard:createProperty.titleCreate')}
        </h1>
        <p className="text-gray-600">
          {t('dashboard:createProperty.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-8">
          {/* Transaction Type */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t('dashboard:createProperty.sections.transactionType')}</h2>
            <div className="flex gap-4">
              <label className={`flex-1 flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer ${
                transactionType === 'sale' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
              }`}>
                <input
                  type="radio"
                  value="sale"
                  {...register('transaction_type')}
                  className="sr-only"
                />
                <span className={transactionType === 'sale' ? 'text-primary-600 font-medium' : 'text-gray-600'}>
                  {t('dashboard:createProperty.transactionType.sale')}
                </span>
              </label>
              <label className={`flex-1 flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer ${
                transactionType === 'rent' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
              }`}>
                <input
                  type="radio"
                  value="rent"
                  {...register('transaction_type')}
                  className="sr-only"
                />
                <span className={transactionType === 'rent' ? 'text-primary-600 font-medium' : 'text-gray-600'}>
                  {t('dashboard:createProperty.transactionType.rent')}
                </span>
              </label>
            </div>
          </div>

          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t('dashboard:createProperty.sections.generalInfo')}</h2>
            <div className="space-y-4">
              <div>
                <label className="label">{t('dashboard:createProperty.fields.listingTitle')}</label>
                <input
                  {...register('title', { required: t('dashboard:createProperty.validation.titleRequired') })}
                  className="input"
                  placeholder={t('dashboard:createProperty.fields.listingTitlePlaceholder')}
                />
                {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="label">{t('dashboard:createProperty.fields.propertyType')}</label>
                <select {...register('property_type')} className="input">
                  {PROPERTY_TYPE_VALUES.map(value => (
                    <option key={value} value={value}>{t(`dashboard:shared.propertyTypes.${value}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">{t('dashboard:createProperty.fields.description')}</label>
                <textarea
                  {...register('description')}
                  className="input"
                  rows="5"
                  placeholder={t('dashboard:createProperty.fields.descriptionPlaceholder')}
                />
              </div>
            </div>
          </div>

          {/* Price & Surface */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t('dashboard:createProperty.sections.priceAndSurface')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  {t('dashboard:createProperty.fields.price', { currency: DIRHAM_SYMBOL })} {transactionType === 'rent' && <span className="text-gray-400">{t('dashboard:createProperty.fields.perMonth')}</span>}
                </label>
                <input
                  type="number"
                  {...register('price', { required: t('dashboard:createProperty.validation.priceRequired'), min: 0 })}
                  className="input"
                  placeholder={t('dashboard:createProperty.fields.pricePlaceholder')}
                />
                {errors.price && <p className="text-red-500 text-sm mt-1">{errors.price.message}</p>}
              </div>

              <div>
                <label className="label">{t('dashboard:createProperty.fields.surface')}</label>
                <input
                  type="number"
                  {...register('surface')}
                  className="input"
                  placeholder="Ex: 85"
                />
              </div>
            </div>
          </div>

          {/* Characteristics */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t('dashboard:createProperty.sections.characteristics')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="label">{t('dashboard:createProperty.fields.rooms')}</label>
                <input
                  type="number"
                  {...register('rooms')}
                  className="input"
                  placeholder="3"
                />
              </div>
              <div>
                <label className="label">{t('dashboard:createProperty.fields.bedrooms')}</label>
                <input
                  type="number"
                  {...register('bedrooms')}
                  className="input"
                  placeholder="2"
                />
              </div>
              <div>
                <label className="label">{t('dashboard:createProperty.fields.bathrooms')}</label>
                <input
                  type="number"
                  {...register('bathrooms')}
                  className="input"
                  placeholder="1"
                />
              </div>
              <div>
                <label className="label">{t('dashboard:createProperty.fields.floor')}</label>
                <input
                  type="number"
                  {...register('floor')}
                  className="input"
                  placeholder="2"
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="label">{t('dashboard:createProperty.fields.features')}</label>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map(feature => {
                  const Icon = getAmenityIcon(feature)
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleFeature(feature)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${
                        selectedFeatures.includes(feature)
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {feature}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t('dashboard:createProperty.sections.location')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('dashboard:createProperty.fields.city')}</label>
                <input
                  {...register('city', { required: t('dashboard:createProperty.validation.cityRequired') })}
                  className="input"
                  placeholder="Ex: Casablanca"
                />
                {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city.message}</p>}
              </div>
              <div>
                <label className="label">{t('dashboard:createProperty.fields.neighborhood')}</label>
                <input
                  {...register('neighborhood')}
                  className="input"
                  placeholder="Ex: Maarif"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">{t('dashboard:createProperty.fields.address')}</label>
                <input
                  {...register('address')}
                  className="input"
                  placeholder="Ex: 123 Boulevard Mohammed V"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard/annonces')}
              className="btn-secondary"
            >
              {t('dashboard:shared.actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary"
            >
              <FiSave className="w-4 h-4 me-2" />
              {isSaving ? t('dashboard:shared.actions.saving') : t('dashboard:shared.actions.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default CreateProperty
