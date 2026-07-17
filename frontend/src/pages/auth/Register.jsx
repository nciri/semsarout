import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { FiUser, FiMail, FiLock, FiPhone, FiEye, FiEyeOff } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
import { SERVICE_OPTIONS, isValidService } from '../../constants/services'

function Register() {
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
            Créer un compte
          </h1>
          <p className="text-gray-600 mt-2">
            Rejoignez Semsar et accédez à toutes les fonctionnalités
          </p>
        </div>

        {/* Contexte service : l'utilisateur arrive depuis une page service/contact */}
        {serviceMeta && (
          <div className="mb-6 p-4 bg-primary-50 border border-primary-100 rounded-xl flex items-center">
            <serviceMeta.icon className="w-5 h-5 text-primary-600 mr-3 flex-shrink-0" />
            <div className="text-sm">
              <span className="text-gray-600">Vous êtes intéressé par :</span>{' '}
              <span className="font-semibold text-primary-700">{serviceMeta.shortLabel}</span>
              <div className="text-gray-500 text-xs mt-0.5">
                Après l'inscription, nous vous guiderons pour cette demande.
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
              <label className="label">Type de compte</label>
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
                    Particulier
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
                    Professionnel
                  </span>
                </label>
              </div>
            </div>

            {/* Account Role */}
            <div>
              <label className="label">Vous êtes plutôt...</label>
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
                      🔍 Acheteur/Chercheur
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Je recherche une propriété</div>
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
                      🏢 Agent/Vendeur
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Je vends des propriétés</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Intent */}
            <div>
              <label className="label">Qu'est-ce qui vous amène ? <span className="text-gray-400 font-normal">(optionnel)</span></label>
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
                      <OptIcon className={`w-4 h-4 mr-2 flex-shrink-0 ${active ? 'text-primary-600' : 'text-gray-400'}`} />
                      {opt.label}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Prénom</label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    {...register('first_name', { required: 'Prénom requis' })}
                    className="input pl-10"
                    placeholder="Prénom"
                  />
                </div>
                {errors.first_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label className="label">Nom</label>
                <input
                  {...register('last_name', { required: 'Nom requis' })}
                  className="input"
                  placeholder="Nom"
                />
                {errors.last_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    {...register('email', {
                      required: 'Email requis',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Email invalide'
                      }
                    })}
                    className="input pl-10"
                    placeholder="votre@email.com"
                  />
                </div>
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="label">Téléphone</label>
                <div className="relative">
                  <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    {...register('phone')}
                    className="input pl-10"
                    placeholder="+212 6XX XXX XXX"
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', {
                    required: 'Mot de passe requis',
                    minLength: {
                      value: 8,
                      message: 'Minimum 8 caractères'
                    }
                  })}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
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
                  {...register('terms', { required: 'Vous devez accepter les conditions' })}
                  className="mt-1 rounded border-gray-300 text-primary-600 mr-2"
                />
                <span className="text-sm text-gray-600">
                  J'accepte les{' '}
                  <Link to="/cgu" target="_blank" className="text-primary-600">conditions d'utilisation</Link>
                  {' '}et la{' '}
                  <Link to="/politique-de-confidentialite" target="_blank" className="text-primary-600">politique de confidentialité</Link>
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
              {isLoading ? 'Inscription...' : 'Créer mon compte'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Déjà un compte ?{' '}
            <Link to={loginLink} className="text-primary-600 hover:text-primary-700 font-medium">
              Connectez-vous
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
