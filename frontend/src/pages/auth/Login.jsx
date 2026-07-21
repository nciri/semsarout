import { useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const { login, isLoading } = useAuthStore()

  const { register, handleSubmit, formState: { errors } } = useForm()

  const onSubmit = async (data) => {
    setError('')
    const result = await login(data.email, data.password)

    if (result.success) {
      const redirectParam = searchParams.get('redirect')
      const from = (redirectParam && redirectParam.startsWith('/') && redirectParam)
        || location.state?.from?.pathname
        || '/dashboard'
      navigate(from, { replace: true })
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center space-x-2 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-600 to-terracotta-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">S</span>
            </div>
          </Link>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Connexion
          </h1>
          <p className="text-gray-600 mt-2">
            Accédez à votre espace SemsarOut
          </p>
        </div>

        <div className="card p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
              <label className="label">Mot de passe</label>
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', { required: 'Mot de passe requis' })}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input type="checkbox" className="rounded border-gray-300 text-primary-600 mr-2" />
                <span className="text-sm text-gray-600">Se souvenir de moi</span>
              </label>
              <Link to="/mot-de-passe-oublie" className="text-sm text-primary-600 hover:text-primary-700">
                Mot de passe oublié ?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center"
            >
              {isLoading ? 'Connexion en cours...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Pas encore de compte ?{' '}
              <Link to="/inscription" className="text-primary-600 hover:text-primary-700 font-medium">
                Créer un compte gratuitement
              </Link>
            </p>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500 mb-3">
            En vous connectant, vous acceptez nos{' '}
            <Link to="/cgu" className="underline">conditions d'utilisation</Link>
            {' '}et notre{' '}
            <Link to="/politique-de-confidentialite" className="underline">politique de confidentialité</Link>
          </p>
          <div className="flex justify-center items-center space-x-4 text-xs text-gray-400">
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Connexion sécurisée
            </span>
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Données protégées
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
