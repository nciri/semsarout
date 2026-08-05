import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { FiUser, FiMail, FiLock, FiPhone, FiEye, FiEyeOff } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
import { SERVICE_OPTIONS, isValidService } from '../../constants/services'

function Register() {
  const { t } = useTranslation(['auth', 'common'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const { register: registerUser, isLoading } = useAuthStore()

  const serviceParam = searchParams.get('service')
  const serviceContext = isValidService(serviceParam) ? serviceParam : null
  const redirectParam = searchParams.get('redirect')
  // Only allow internal redirects to avoid open-redirect abuse
  const redirectTo = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard'

  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    defaultValues: { interest: serviceContext || '', account_role: 'buyer' }
  })
  const userType = watch('user_type', 'particular')
  const interest = watch('interest', serviceContext || '')
  const accountRole = watch('account_role', 'buyer')

  const onSubmit = async (data) => {
    setError('')
    const result = await registerUser({
      ...data,
      interest: data.interest || undefined
    })

    if (result.success) {
      navigate(redirectTo)
    } else {
      setError(result.error)
    }
  }

  const loginLink = `/connexion${redirectParam ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`
  const serviceMeta = serviceContext ? SERVICE_OPTIONS[serviceContext] : null

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-bold text-gray-900">
            {t('auth:register.title')}
          </h1>
          <p className="text-gray-600 mt-2">
            {t('auth:register.subtitle')}
          </p>
        </div>

        {/* Contexte service : l'utilisateur arrive depuis une page service/contact */}
        {serviceMeta && (
          <div className="mb-6 p-4 bg-primary-50 border border-primary-100 rounded-xl flex items-center">
            <serviceMeta.icon className="w-5 h-5 text-primary-600 me-3 flex-shrink-0" />
            <div className="text-sm">
              <span className="text-gray-600">{t('auth:register.interestedIn')}</span>{' '}
              <span className="font-semibold text-primary-700">{serviceMeta.shortLabel}</span>
              <div className="text-gray-500 text-xs mt-0.5">
                {t('auth:register.serviceFollowUp')}
              </div>
            </div>
          </div>
        )}

        <div className="card p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* User Type */}
            <div>
              <label className="label">{t('auth:register.accountTypeLabel')}</label>
              <div className="grid grid-cols-2 gap-4">
                <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  userType === 'particular' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    value="particular"
                    {...register('user_type')}
                    className="sr-only"
                  />
                  <span className={userType === 'particular' ? 'text-primary-600' : 'text-gray-600'}>
                    {t('auth:register.particular')}
                  </span>
                </label>
                <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  userType === 'professional' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    value="professional"
                    {...register('user_type')}
                    className="sr-only"
                  />
                  <span className={userType === 'professional' ? 'text-primary-600' : 'text-gray-600'}>
                    {t('auth:register.professional')}
                  </span>
                </label>
              </div>
            </div>

            {/* Account Role */}
            <div>
              <label className="label">{t('auth:register.accountRoleLabel')}</label>
              <div className="grid grid-cols-2 gap-4">
                <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  accountRole === 'buyer' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    value="buyer"
                    {...register('account_role')}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className={accountRole === 'buyer' ? 'text-primary-600 font-semibold' : 'text-gray-600'}>
                      {t('auth:register.buyerRole')}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t('auth:register.buyerRoleDescription')}</div>
                  </div>
                </label>
                <label className={`flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  accountRole === 'agent' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    value="agent"
                    {...register('account_role')}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className={accountRole === 'agent' ? 'text-primary-600 font-semibold' : 'text-gray-600'}>
                      {t('auth:register.agentRole')}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t('auth:register.agentRoleDescription')}</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Intent */}
            <div>
              <label className="label">{t('auth:register.intentLabel')} <span className="text-gray-400 font-normal">{t('auth:register.optional')}</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(SERVICE_OPTIONS).map(([key, opt]) => {
                  const OptIcon = opt.icon
                  const active = interest === key
                  return (
                    <label
                      key={key}
                      className={`flex items-center p-2.5 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
                        active ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        value={key}
                        {...register('interest')}
                        className="sr-only"
                      />
                      <OptIcon className={`w-4 h-4 me-2 flex-shrink-0 ${active ? 'text-primary-600' : 'text-gray-400'}`} />
                      {opt.label}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t('auth:register.firstNameLabel')}</label>
                <div className="relative">
                  <FiUser className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    {...register('first_name', { required: t('common:validation.firstNameRequired') })}
                    className="input ps-10"
                    placeholder={t('auth:register.firstNamePlaceholder')}
                  />
                </div>
                {errors.first_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label className="label">{t('auth:register.lastNameLabel')}</label>
                <input
                  {...register('last_name', { required: t('common:validation.lastNameRequired') })}
                  className="input"
                  placeholder={t('auth:register.lastNamePlaceholder')}
                />
                {errors.last_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('auth:register.emailLabel')}</label>
                <div className="relative">
                  <FiMail className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    {...register('email', {
                      required: t('common:validation.emailRequired'),
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: t('common:validation.emailInvalid')
                      }
                    })}
                    className="input ps-10"
                    placeholder={t('auth:register.emailPlaceholder')}
                  />
                </div>
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="label">{t('auth:register.phoneLabel')}</label>
                <div className="relative">
                  <FiPhone className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    {...register('phone')}
                    className="input ps-10"
                    placeholder={t('auth:register.phonePlaceholder')}
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label">{t('auth:register.passwordLabel')}</label>
              <div className="relative">
                <FiLock className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', {
                    required: t('common:validation.passwordRequired'),
                    minLength: {
                      value: 8,
                      message: t('common:validation.passwordMin8')
                    }
                  })}
                  className="input ps-10 pe-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Terms */}
            <div>
              <label className="flex items-start">
                <input
                  type="checkbox"
                  {...register('terms', { required: t('auth:register.termsRequired') })}
                  className="mt-1 rounded border-gray-300 text-primary-600 me-2"
                />
                <span className="text-sm text-gray-600">
                  {t('auth:register.termsPrefix')}{' '}
                  <Link to="/cgu" target="_blank" className="text-primary-600">{t('auth:register.termsLink')}</Link>
                  {' '}{t('auth:register.termsAnd')}{' '}
                  <Link to="/politique-de-confidentialite" target="_blank" className="text-primary-600">{t('auth:register.privacyLink')}</Link>
                </span>
              </label>
              {errors.terms && (
                <p className="text-red-500 text-sm mt-1">{errors.terms.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? t('auth:register.submitting') : t('auth:register.submit')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            {t('auth:register.hasAccount')}{' '}
            <Link to={loginLink} className="text-primary-600 hover:text-primary-700 font-medium">
              {t('auth:register.loginLink')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
