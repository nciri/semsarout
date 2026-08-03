import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { FiLock, FiEye, FiEyeOff, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'

function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, watch, formState: { errors } } = useForm()
  const newPassword = watch('new_password')

  const onSubmit = async (data) => {
    setError('')
    setIsLoading(true)
    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: data.new_password
      })
      setSuccess(true)
      setTimeout(() => navigate('/connexion'), 2500)
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue')
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full text-center card p-8">
          <p className="text-gray-600 mb-4">
            Lien de réinitialisation invalide ou manquant.
          </p>
          <Link to="/mot-de-passe-oublie" className="text-primary-600 hover:text-primary-700 font-medium text-sm">
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Nouveau mot de passe
          </h1>
          <p className="text-gray-600 mt-2">
            Choisissez un nouveau mot de passe pour votre compte
          </p>
        </div>

        <div className="card p-8">
          {success ? (
            <div className="text-center py-4">
              <FiCheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="font-semibold text-gray-900 mb-2">Mot de passe réinitialisé</h2>
              <p className="text-sm text-gray-600">
                Redirection vers la page de connexion...
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="label">Nouveau mot de passe</label>
                  <div className="relative">
                    <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      {...register('new_password', {
                        required: 'Mot de passe requis',
                        minLength: { value: 8, message: 'Minimum 8 caractères' }
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
                  {errors.new_password && (
                    <p className="text-red-500 text-sm mt-1">{errors.new_password.message}</p>
                  )}
                </div>

                <div>
                  <label className="label">Confirmer le mot de passe</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('confirm_password', {
                      required: 'Confirmation requise',
                      validate: (value) => value === newPassword || 'Les mots de passe ne correspondent pas'
                    })}
                    className="input"
                    placeholder="••••••••"
                  />
                  {errors.confirm_password && (
                    <p className="text-red-500 text-sm mt-1">{errors.confirm_password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full justify-center"
                >
                  {isLoading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ResetPassword
