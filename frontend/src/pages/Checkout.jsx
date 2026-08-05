import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { FiLock, FiCheck, FiCreditCard, FiArrowLeft } from 'react-icons/fi'
import useAuthStore from '../store/authStore'
import api from '../services/api'
import { formatPrice } from '../utils/currency'
import DirIcon from '../components/common/DirIcon'

const SERVICES = {
  'forfait-vente': {
    name: 'Forfait Vente',
    price: 4900,
    description: 'Service complet de vente immobilière'
  },
  'photos-pro': {
    name: 'Photos Professionnelles',
    price: 990,
    description: 'Shooting photo professionnel'
  },
  'photos-pro-360': {
    name: 'Photos + Visite 360°',
    price: 1490,
    description: 'Shooting photo + visite virtuelle'
  },
  'photos-pro-drone': {
    name: 'Photos + Drone',
    price: 1790,
    description: 'Shooting photo + prises de vue drone'
  }
}

const SUBSCRIPTION_PLANS = {
  starter: { name: 'Starter', monthly: 299, yearly: 2990 },
  pro: { name: 'Pro', monthly: 799, yearly: 7990 },
  enterprise: { name: 'Enterprise', monthly: 1999, yearly: 19990 }
}

function Checkout() {
  const { t } = useTranslation(['public', 'common'])
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [step, setStep] = useState(1)
  const [paymentError, setPaymentError] = useState('')

  const serviceId = searchParams.get('service')
  const planId = searchParams.get('plan')
  const billingCycle = searchParams.get('billing') || 'yearly'

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      email: user?.email || '',
      name: `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    }
  })

  // Determine what we're paying for
  let item = null
  let price = 0

  if (serviceId && SERVICES[serviceId]) {
    item = SERVICES[serviceId]
    price = item.price
  } else if (planId && SUBSCRIPTION_PLANS[planId]) {
    item = SUBSCRIPTION_PLANS[planId]
    price = billingCycle === 'yearly' ? item.yearly : item.monthly
  }

  useEffect(() => {
    if (!item) {
      navigate('/nos-services')
    }
  }, [item, navigate])

  const onSubmit = async (data) => {
    setIsProcessing(true)
    setPaymentError('')

    try {
      // Create payment intent on backend
      const response = await api.post('/payments/create-intent', {
        service_id: serviceId,
        plan_id: planId,
        billing_cycle: billingCycle,
        payment_method: paymentMethod,
        customer_info: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          city: data.city
        }
      })

      if (response.data.payment_url) {
        // Redirect to payment gateway (CMI, etc.)
        window.location.href = response.data.payment_url
      } else if (response.data.status === 'pending_transfer') {
        // Bank transfer - show instructions
        navigate('/checkout/confirmation', {
          state: { paymentId: response.data.payment_id, method: 'transfer' }
        })
      } else {
        navigate('/checkout/confirmation', {
          state: { paymentId: response.data.payment_id, method: 'card' }
        })
      }
    } catch (error) {
      console.error('Payment error:', error)
      setPaymentError(error.response?.data?.error || t('public:checkout.genericError'))
    } finally {
      setIsProcessing(false)
    }
  }

  if (!item) {
    return null
  }

  return (
    <div className="min-h-[calc(100vh-200px)] bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          to={serviceId ? '/nos-services' : '/agences/tarifs'}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-8"
        >
          <DirIcon icon={FiArrowLeft} className="w-4 h-4 me-2" />
          {t('public:checkout.backLink')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm p-8">
              <h1 className="font-display text-2xl font-bold text-gray-900 mb-8">
                {t('public:checkout.title')}
              </h1>

              {paymentError && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
                  {paymentError}
                </div>
              )}

              {/* Steps */}
              <div className="flex items-center mb-8">
                <div className={`flex items-center ${step >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200'
                  }`}>
                    {step > 1 ? <FiCheck className="w-4 h-4" /> : '1'}
                  </div>
                  <span className="ms-2 font-medium">{t('public:checkout.stepInfoLabel')}</span>
                </div>
                <div className="flex-1 h-px bg-gray-200 mx-4"></div>
                <div className={`flex items-center ${step >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200'
                  }`}>
                    2
                  </div>
                  <span className="ms-2 font-medium">{t('public:checkout.stepPaymentLabel')}</span>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)}>
                {step === 1 && (
                  <div className="space-y-6">
                    <h2 className="font-semibold text-lg">{t('public:checkout.step1Title')}</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="label">{t('public:checkout.nameLabel')}</label>
                        <input
                          {...register('name', { required: t('public:checkout.nameRequired') })}
                          className="input"
                          placeholder={t('public:checkout.namePlaceholder')}
                        />
                        {errors.name && (
                          <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                        )}
                      </div>
                      <div>
                        <label className="label">{t('public:checkout.emailLabel')}</label>
                        <input
                          type="email"
                          {...register('email', { required: t('public:checkout.emailRequired') })}
                          className="input"
                          placeholder={t('public:checkout.emailPlaceholder')}
                        />
                        {errors.email && (
                          <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="label">{t('public:checkout.phoneLabel')}</label>
                      <input
                        {...register('phone', { required: t('public:checkout.phoneRequired') })}
                        className="input"
                        placeholder={t('public:checkout.phonePlaceholder')}
                      />
                      {errors.phone && (
                        <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="label">{t('public:checkout.addressLabel')}</label>
                        <input
                          {...register('address')}
                          className="input"
                          placeholder={t('public:checkout.addressPlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="label">{t('public:checkout.cityLabel')}</label>
                        <input
                          {...register('city')}
                          className="input"
                          placeholder={t('public:checkout.cityPlaceholder')}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="btn-primary w-full justify-center"
                    >
                      {t('public:checkout.continueButton')}
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium inline-flex items-center"
                    >
                      <DirIcon icon={FiArrowLeft} className="w-3.5 h-3.5 me-1.5" />
                      {t('public:checkout.editInfoButton')}
                    </button>

                    <h2 className="font-semibold text-lg">{t('public:checkout.paymentMethodTitle')}</h2>

                    {/* Payment Methods */}
                    <div className="space-y-3">
                      <label
                        className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                          paymentMethod === 'card'
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment_method"
                          value="card"
                          checked={paymentMethod === 'card'}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="sr-only"
                        />
                        <FiCreditCard className="w-6 h-6 text-gray-600 me-4" />
                        <div className="flex-1">
                          <div className="font-medium">{t('public:checkout.cardMethodLabel')}</div>
                          <div className="text-sm text-gray-500">{t('public:checkout.cardMethodNote')}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <img src="/visa.svg" alt="Visa" className="h-6" />
                          <img src="/mastercard.svg" alt="Mastercard" className="h-6" />
                        </div>
                      </label>

                      <label
                        className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                          paymentMethod === 'transfer'
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment_method"
                          value="transfer"
                          checked={paymentMethod === 'transfer'}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="sr-only"
                        />
                        <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center me-4">
                          <span className="text-xs font-bold">{t('public:checkout.transferMethodShort')}</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{t('public:checkout.transferMethodLabel')}</div>
                          <div className="text-sm text-gray-500">{t('public:checkout.transferMethodNote')}</div>
                        </div>
                      </label>
                    </div>

                    {/* Card form would go here with payment gateway integration */}
                    {paymentMethod === 'card' && (
                      <div className="bg-gray-50 rounded-xl p-6">
                        <p className="text-sm text-gray-600 text-center">
                          {t('public:checkout.cardRedirectNote')}
                        </p>
                      </div>
                    )}

                    {paymentMethod === 'transfer' && (
                      <div className="bg-blue-50 rounded-xl p-6">
                        <h3 className="font-medium text-blue-900 mb-2">
                          {t('public:checkout.transferInstructionsTitle')}
                        </h3>
                        <p className="text-sm text-blue-800">
                          {t('public:checkout.transferInstructionsText')}
                        </p>
                      </div>
                    )}

                    {/* Terms */}
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        {...register('terms', { required: true })}
                        className="mt-1 rounded border-gray-300 text-primary-600 me-2"
                      />
                      <span className="text-sm text-gray-600">
                        {t('public:checkout.termsPrefix')}{' '}
                        <Link to="/cgu" target="_blank" className="text-primary-600 underline">{t('public:checkout.termsLink')}</Link>
                        {' '}{t('public:checkout.termsAnd')}{' '}
                        <Link to="/politique-de-confidentialite" target="_blank" className="text-primary-600 underline">{t('public:checkout.privacyLink')}</Link>
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="btn-primary w-full justify-center"
                    >
                      {isProcessing ? (
                        t('public:checkout.processing')
                      ) : (
                        <>
                          <FiLock className="w-4 h-4 me-2" />
                          {t('public:checkout.payButton', { price: formatPrice(price) })}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-24">
              <h2 className="font-semibold text-lg mb-4">{t('public:checkout.summaryTitle')}</h2>

              <div className="border-b border-gray-100 pb-4 mb-4">
                <div className="font-medium text-gray-900">{item.name}</div>
                <div className="text-sm text-gray-500">{item.description || ''}</div>
                {planId && (
                  <div className="text-sm text-gray-500">
                    {billingCycle === 'yearly'
                      ? t('public:checkout.billingYearly')
                      : t('public:checkout.billingMonthly')}
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('public:checkout.subtotalLabel')}</span>
                  <span>{formatPrice(price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('public:checkout.vatLabel')}</span>
                  <span>{t('public:checkout.vatIncluded')}</span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>{t('public:checkout.totalLabel')}</span>
                  <span className="text-primary-600">{formatPrice(price)}</span>
                </div>
              </div>

              {/* Security badges */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-center text-sm text-gray-500 mb-4">
                  <FiLock className="w-4 h-4 me-2" />
                  {t('public:checkout.securePaymentNote')}
                </div>
                <div className="flex justify-center space-x-4 opacity-50">
                  <img src="/visa.svg" alt="Visa" className="h-6" />
                  <img src="/mastercard.svg" alt="Mastercard" className="h-6" />
                  <img src="/cmi.svg" alt="CMI" className="h-6" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Checkout
