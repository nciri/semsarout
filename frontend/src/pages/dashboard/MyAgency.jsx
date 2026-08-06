import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiSave, FiRefreshCw, FiCopy, FiEye, FiEyeOff } from 'react-icons/fi'
import { agencyService } from '../../services/agencyService'
import useAuthStore from '../../store/authStore'

function MyAgency() {
  const { t } = useTranslation(['dashboard', 'common'])
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
        toast.success(t('dashboard:myAgency.toasts.created'))
        updateUser({ agency_id: response.agency.id })
        queryClient.invalidateQueries('my-agency')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || t('dashboard:myAgency.toasts.createError'))
      }
    }
  )

  const updateMutation = useMutation(
    (data) => agencyService.updateAgency(agency.slug, data),
    {
      onSuccess: () => {
        toast.success(t('dashboard:myAgency.toasts.updated'))
        queryClient.invalidateQueries('my-agency')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || t('dashboard:myAgency.toasts.updateError'))
      }
    }
  )

  const regenerateKeyMutation = useMutation(
    () => agencyService.regenerateApiKey(agency.slug),
    {
      onSuccess: () => {
        toast.success(t('dashboard:myAgency.toasts.keyRegenerated'))
        queryClient.invalidateQueries('my-agency')
      }
    }
  )

  const copyApiKey = () => {
    navigator.clipboard.writeText(agency.api_key)
    toast.success(t('dashboard:myAgency.toasts.keyCopied'))
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
            {t('dashboard:myAgency.create.title')}
          </h1>
          <p className="text-gray-600">
            {t('dashboard:myAgency.create.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="card p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">{t('dashboard:myAgency.fields.name')} *</label>
                <input
                  {...register('name', { required: t('dashboard:myAgency.validation.nameRequired') })}
                  className="input"
                  placeholder={t('dashboard:myAgency.placeholders.name')}
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.email')} *</label>
                <input
                  type="email"
                  {...register('email', { required: t('dashboard:myAgency.validation.emailRequired') })}
                  className="input"
                  placeholder={t('dashboard:myAgency.placeholders.email')}
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.phone')}</label>
                <input
                  {...register('phone')}
                  className="input"
                  placeholder={t('dashboard:myAgency.placeholders.phone')}
                />
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.city')}</label>
                <input
                  {...register('city')}
                  className="input"
                  placeholder={t('dashboard:myAgency.placeholders.city')}
                />
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.website')}</label>
                <input
                  {...register('website')}
                  className="input"
                  placeholder={t('dashboard:myAgency.placeholders.website')}
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">{t('dashboard:myAgency.fields.address')}</label>
                <input
                  {...register('address')}
                  className="input"
                  placeholder={t('dashboard:myAgency.placeholders.address')}
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">{t('dashboard:myAgency.fields.description')}</label>
                <textarea
                  {...register('description')}
                  className="input"
                  rows="3"
                  placeholder={t('dashboard:myAgency.placeholders.description')}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createMutation.isLoading}
                className="btn-primary"
              >
                <FiSave className="w-4 h-4 me-2" />
                {createMutation.isLoading ? t('dashboard:myAgency.create.submitting') : t('dashboard:myAgency.create.submit')}
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
          {t('dashboard:myAgency.edit.title')}
        </h1>
        <p className="text-gray-600">
          {t('dashboard:myAgency.edit.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t('dashboard:myAgency.edit.generalInfo')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">{t('dashboard:myAgency.fields.name')}</label>
                <input
                  {...register('name')}
                  defaultValue={agency?.name}
                  className="input"
                />
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.emailShort')}</label>
                <input
                  type="email"
                  {...register('email')}
                  defaultValue={agency?.email}
                  className="input"
                />
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.phone')}</label>
                <input
                  {...register('phone')}
                  defaultValue={agency?.phone}
                  className="input"
                />
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.website')}</label>
                <input
                  {...register('website')}
                  defaultValue={agency?.website}
                  className="input"
                />
              </div>

              <div>
                <label className="label">{t('dashboard:myAgency.fields.city')}</label>
                <input
                  {...register('city')}
                  defaultValue={agency?.city}
                  className="input"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">{t('dashboard:myAgency.fields.address')}</label>
                <input
                  {...register('address')}
                  defaultValue={agency?.address}
                  className="input"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">{t('dashboard:myAgency.fields.description')}</label>
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
                <FiSave className="w-4 h-4 me-2" />
                {updateMutation.isLoading ? t('dashboard:myAgency.edit.saving') : t('dashboard:shared.actions.save')}
              </button>
            </div>
          </div>

          {/* API Access */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t('dashboard:myAgency.api.title')}</h2>
            <p className="text-sm text-gray-600 mb-4">
              {t('dashboard:myAgency.api.description')}
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-grow relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={agency?.api_key || ''}
                  readOnly
                  className="input pe-20 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              <button
                type="button"
                onClick={copyApiKey}
                className="btn-secondary p-2"
                title={t('dashboard:myAgency.api.copy')}
              >
                <FiCopy className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => regenerateKeyMutation.mutate()}
                disabled={regenerateKeyMutation.isLoading}
                className="btn-secondary p-2"
                title={t('dashboard:myAgency.api.regenerate')}
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
