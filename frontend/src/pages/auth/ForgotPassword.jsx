import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { FiMail, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'

function ForgotPassword() {
  const { t } = useTranslation(['auth', 'common'])
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm()

  const onSubmit = async (data) => {
    setError('')
    setIsLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: data.email })
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.error || t('common:errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-bold text-gray-900">
            {t('auth:forgot.title')}
          </h1>
          <p className="text-gray-600 mt-2">
            {t('auth:forgot.subtitle')}
          </p>
        </div>

        <div className="card p-8">
          {submitted ? (
            <div className="text-center py-4">
              <FiCheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="font-semibold text-gray-900 mb-2">{t('auth:forgot.sentTitle')}</h2>
              <p className="text-sm text-gray-600 mb-6">
                {t('auth:forgot.sentBody')}
              </p>
              <Link to="/connexion" className="text-primary-600 hover:text-primary-700 font-medium text-sm">
                {t('auth:forgot.backToLogin')}
              </Link>
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
                  <label className="label">{t('auth:forgot.emailLabel')}</label>
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
                      placeholder={t('auth:forgot.emailPlaceholder')}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full justify-center"
                >
                  {isLoading ? t('auth:forgot.submitting') : t('auth:forgot.submit')}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link to="/connexion" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  {t('auth:forgot.backToLogin')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
