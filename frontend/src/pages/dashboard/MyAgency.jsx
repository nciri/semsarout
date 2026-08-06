import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { FiSave, FiRefreshCw, FiCopy, FiEye, FiEyeOff } from 'react-icons/fi'
import { agencyService } from '../../services/agencyService'
import useAuthStore from '../../store/authStore'

function MyAgency() {
  const { user, updateUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [showApiKey, setShowApiKey] = useState(false)

  const { data: agency, isLoading } = useQuery(
    'my-agency',
    () => agencyService.getMyAgency(),
    { enabled: !!user?.agency_id }
  )

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm()

  const createMutation = useMutation(
    (data) => agencyService.createAgency(data),
    {
      onSuccess: (response) => {
        toast.success('Agence créée avec succès')
        updateUser({ agency_id: response.agency.id })
        queryClient.invalidateQueries('my-agency')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Erreur lors de la création')
      }
    }
  )

  const updateMutation = useMutation(
    (data) => agencyService.updateAgency(agency.slug, data),
    {
      onSuccess: () => {
        toast.success('Agence mise à jour')
        queryClient.invalidateQueries('my-agency')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour')
      }
    }
  )

  const regenerateKeyMutation = useMutation(
    () => agencyService.regenerateApiKey(agency.slug),
    {
      onSuccess: (data) => {
        // La réponse renvoie la nouvelle clé : l'afficher immédiatement (le refetch
        // /my-agency la renvoie aussi désormais, mais setQueryData évite l'attente).
        if (data?.api_key) {
          queryClient.setQueryData('my-agency', (old) => (old ? { ...old, api_key: data.api_key } : old))
          setShowApiKey(true)
        }
        queryClient.invalidateQueries('my-agency')
        toast.success('Clé API régénérée')
      }
    }
  )

  const copyApiKey = () => {
    navigator.clipboard.writeText(agency.api_key)
    toast.success('Clé API copiée')
  }

  const onSubmit = (data) => {
    if (agency) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="card p-6 space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  // No agency yet - show creation form
  if (!user?.agency_id) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Créer votre espace agence
          </h1>
          <p className="text-gray-600">
            Remplissez les informations de votre agence pour accéder aux fonctionnalités pro
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="card p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Nom de l'agence *</label>
                <input
                  {...register('name', { required: 'Nom requis' })}
                  className="input"
                  placeholder="Ex: Agence Immobilière Excellence"
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="label">Email professionnel *</label>
                <input
                  type="email"
                  {...register('email', { required: 'Email requis' })}
                  className="input"
                  placeholder="contact@agence.ma"
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="label">Téléphone</label>
                <input
                  {...register('phone')}
                  className="input"
                  placeholder="+212 5XX XXX XXX"
                />
              </div>

              <div>
                <label className="label">Ville</label>
                <input
                  {...register('city')}
                  className="input"
                  placeholder="Casablanca"
                />
              </div>

              <div>
                <label className="label">Site web</label>
                <input
                  {...register('website')}
                  className="input"
                  placeholder="https://www.votre-agence.ma"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">Adresse</label>
                <input
                  {...register('address')}
                  className="input"
                  placeholder="123 Boulevard Mohammed V"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">Description</label>
                <textarea
                  {...register('description')}
                  className="input"
                  rows="3"
                  placeholder="Présentez votre agence..."
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createMutation.isLoading}
                className="btn-primary"
              >
                <FiSave className="w-4 h-4 mr-2" />
                {createMutation.isLoading ? 'Création...' : 'Créer l\'agence'}
              </button>
            </div>
          </div>
        </form>
      </div>
    )
  }

  // Agency exists - show edit form
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">
          Mon agence
        </h1>
        <p className="text-gray-600">
          Gérez les informations de votre agence
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Informations générales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Nom de l'agence</label>
                <input
                  {...register('name')}
                  defaultValue={agency?.name}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  {...register('email')}
                  defaultValue={agency?.email}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Téléphone</label>
                <input
                  {...register('phone')}
                  defaultValue={agency?.phone}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Site web</label>
                <input
                  {...register('website')}
                  defaultValue={agency?.website}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Ville</label>
                <input
                  {...register('city')}
                  defaultValue={agency?.city}
                  className="input"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">Adresse</label>
                <input
                  {...register('address')}
                  defaultValue={agency?.address}
                  className="input"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">Description</label>
                <textarea
                  {...register('description')}
                  defaultValue={agency?.description}
                  className="input"
                  rows="3"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={updateMutation.isLoading}
                className="btn-primary"
              >
                <FiSave className="w-4 h-4 mr-2" />
                {updateMutation.isLoading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>

          {/* API Access */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Accès API</h2>
            <p className="text-sm text-gray-600 mb-4">
              Utilisez cette clé API pour synchroniser vos annonces depuis vos logiciels métiers.
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-grow relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={agency?.api_key || ''}
                  readOnly
                  className="input pr-20 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              <button
                type="button"
                onClick={copyApiKey}
                className="btn-secondary p-2"
                title="Copier"
              >
                <FiCopy className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => regenerateKeyMutation.mutate()}
                disabled={regenerateKeyMutation.isLoading}
                className="btn-secondary p-2"
                title="Régénérer"
              >
                <FiRefreshCw className={`w-5 h-5 ${regenerateKeyMutation.isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

export default MyAgency
