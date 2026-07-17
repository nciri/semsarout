import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation } from 'react-query'
import { toast } from 'react-toastify'
import { FiSave, FiEye } from 'react-icons/fi'
import { propertyService } from '../../services/propertyService'
import { DIRHAM_SYMBOL } from '../../utils/currency'

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Appartement' },
  { value: 'house', label: 'Maison' },
  { value: 'villa', label: 'Villa' },
  { value: 'land', label: 'Terrain' },
  { value: 'commercial', label: 'Local commercial' },
  { value: 'office', label: 'Bureau' }
]

const FEATURES = [
  'Parking', 'Garage', 'Balcon', 'Terrasse', 'Jardin',
  'Piscine', 'Ascenseur', 'Climatisation', 'Chauffage central',
  'Gardien', 'Interphone', 'Meublé', 'Cuisine équipée'
]

function CreateProperty() {
  const navigate = useNavigate()
  const [selectedFeatures, setSelectedFeatures] = useState([])

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      transaction_type: 'sale',
      property_type: 'apartment'
    }
  })

  const transactionType = watch('transaction_type')

  const createMutation = useMutation(
    (data) => propertyService.createProperty(data),
    {
      onSuccess: (response) => {
        toast.success('Annonce créée avec succès')
        navigate('/dashboard/annonces')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Erreur lors de la création')
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
    createMutation.mutate({
      ...data,
      features: selectedFeatures,
      price: parseFloat(data.price),
      surface: data.surface ? parseFloat(data.surface) : null,
      rooms: data.rooms ? parseInt(data.rooms) : null,
      bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
      bathrooms: data.bathrooms ? parseInt(data.bathrooms) : null
    })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">
          Créer une annonce
        </h1>
        <p className="text-gray-600">
          Remplissez les informations de votre bien immobilier
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-8">
          {/* Transaction Type */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Type de transaction</h2>
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
                  Vente
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
                  Location
                </span>
              </label>
            </div>
          </div>

          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Informations générales</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Titre de l'annonce *</label>
                <input
                  {...register('title', { required: 'Titre requis' })}
                  className="input"
                  placeholder="Ex: Appartement 3 pièces avec vue mer"
                />
                {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="label">Type de bien *</label>
                <select {...register('property_type')} className="input">
                  {PROPERTY_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  {...register('description')}
                  className="input"
                  rows="5"
                  placeholder="Décrivez votre bien en détail..."
                />
              </div>
            </div>
          </div>

          {/* Price & Surface */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Prix et surface</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Prix ({DIRHAM_SYMBOL}) * {transactionType === 'rent' && <span className="text-gray-400">/ mois</span>}
                </label>
                <input
                  type="number"
                  {...register('price', { required: 'Prix requis', min: 0 })}
                  className="input"
                  placeholder="Ex: 1500000"
                />
                {errors.price && <p className="text-red-500 text-sm mt-1">{errors.price.message}</p>}
              </div>

              <div>
                <label className="label">Surface (m²)</label>
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
            <h2 className="font-semibold mb-4">Caractéristiques</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="label">Pièces</label>
                <input
                  type="number"
                  {...register('rooms')}
                  className="input"
                  placeholder="3"
                />
              </div>
              <div>
                <label className="label">Chambres</label>
                <input
                  type="number"
                  {...register('bedrooms')}
                  className="input"
                  placeholder="2"
                />
              </div>
              <div>
                <label className="label">Salles de bain</label>
                <input
                  type="number"
                  {...register('bathrooms')}
                  className="input"
                  placeholder="1"
                />
              </div>
              <div>
                <label className="label">Étage</label>
                <input
                  type="number"
                  {...register('floor')}
                  className="input"
                  placeholder="2"
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="label">Équipements</label>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map(feature => (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={`px-3 py-1.5 rounded-full text-sm ${
                      selectedFeatures.includes(feature)
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {feature}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Localisation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Ville *</label>
                <input
                  {...register('city', { required: 'Ville requise' })}
                  className="input"
                  placeholder="Ex: Casablanca"
                />
                {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city.message}</p>}
              </div>
              <div>
                <label className="label">Quartier</label>
                <input
                  {...register('neighborhood')}
                  className="input"
                  placeholder="Ex: Maarif"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Adresse</label>
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
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isLoading}
              className="btn-primary"
            >
              <FiSave className="w-4 h-4 mr-2" />
              {createMutation.isLoading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default CreateProperty
