import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  FiCheck, FiX, FiCreditCard, FiDownload, FiCheckCircle, FiClock,
  FiAlertCircle, FiCalendar, FiStar, FiZap, FiAward,
  FiPlus, FiTrash2, FiRefreshCw
} from 'react-icons/fi'
import { jsPDF } from 'jspdf'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import useAuthStore from '../../store/authStore'
import { formatPrice } from '../../utils/currency'
import api from '../../services/api'
import { CONTACT } from '../../constants/contact'
import { useFormat } from '../../utils/format'

// Generate invoice PDF (t: fonction de traduction i18n, injectée par l'appelant)
const generateInvoicePDF = (invoice, user, t) => {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Colors
  const primaryColor = [30, 58, 95] // #1e3a5f
  const grayColor = [107, 114, 128]
  const blackColor = [17, 24, 39]

  // Header
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageWidth, 40, 'F')

  // Logo/Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('SemsarOut', 20, 25)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('www.semsarout.com', 20, 33)

  // Invoice title
  doc.setFontSize(12)
  doc.text(t('dashboard:subscription.invoicePdf.invoiceTitle'), pageWidth - 20, 25, { align: 'right' })
  doc.text(invoice.reference, pageWidth - 20, 33, { align: 'right' })

  // Reset text color
  doc.setTextColor(...blackColor)

  // Invoice details section
  let yPos = 60

  // Date and period
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(t('dashboard:subscription.invoicePdf.billingDate'), 20, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(new Date(invoice.date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }), 70, yPos)

  yPos += 8
  doc.setFont('helvetica', 'bold')
  doc.text(t('dashboard:subscription.invoicePdf.period'), 20, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.period, 70, yPos)

  // Client info
  yPos += 20
  doc.setFillColor(249, 250, 251)
  doc.rect(20, yPos - 5, pageWidth - 40, 35, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(t('dashboard:subscription.invoicePdf.billedTo'), 25, yPos + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.email || t('dashboard:subscription.invoicePdf.client'), 25, yPos + 14)
  doc.text(user?.email || '', 25, yPos + 22)

  // Company info (right side)
  doc.setFont('helvetica', 'bold')
  doc.text(t('dashboard:subscription.invoicePdf.companyName'), pageWidth - 25, yPos + 5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text(t('dashboard:subscription.invoicePdf.companyAddress'), pageWidth - 25, yPos + 14, { align: 'right' })
  doc.text(t('dashboard:subscription.invoicePdf.companyCity'), pageWidth - 25, yPos + 22, { align: 'right' })

  // Invoice items table
  yPos += 50

  // Table header
  doc.setFillColor(...primaryColor)
  doc.rect(20, yPos, pageWidth - 40, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(t('dashboard:subscription.invoicePdf.descriptionCol'), 25, yPos + 7)
  doc.text(t('dashboard:subscription.invoicePdf.quantityCol'), 110, yPos + 7)
  doc.text(t('dashboard:subscription.invoicePdf.unitPriceCol'), 135, yPos + 7)
  doc.text(t('dashboard:subscription.invoicePdf.totalCol'), pageWidth - 25, yPos + 7, { align: 'right' })

  // Table row
  yPos += 10
  doc.setTextColor(...blackColor)
  doc.setFillColor(255, 255, 255)
  doc.rect(20, yPos, pageWidth - 40, 12, 'F')
  doc.setFont('helvetica', 'normal')
  doc.text(t('dashboard:subscription.invoicePdf.subscriptionLine', { plan: invoice.planName || t('dashboard:subscription.invoicePdf.defaultPlanName'), period: invoice.period }), 25, yPos + 8)
  doc.text('1', 115, yPos + 8)
  doc.text(formatPrice(invoice.amount), 135, yPos + 8)
  doc.text(formatPrice(invoice.amount), pageWidth - 25, yPos + 8, { align: 'right' })

  // Separator line
  yPos += 15
  doc.setDrawColor(229, 231, 235)
  doc.line(20, yPos, pageWidth - 20, yPos)

  // Totals
  yPos += 15
  doc.setTextColor(...grayColor)
  doc.text(t('dashboard:subscription.invoicePdf.subtotalHt'), 130, yPos)
  doc.setTextColor(...blackColor)
  doc.text(formatPrice(invoice.amount * 0.8), pageWidth - 25, yPos, { align: 'right' })

  yPos += 8
  doc.setTextColor(...grayColor)
  doc.text(t('dashboard:subscription.invoicePdf.vat'), 130, yPos)
  doc.setTextColor(...blackColor)
  doc.text(formatPrice(invoice.amount * 0.2), pageWidth - 25, yPos, { align: 'right' })

  yPos += 10
  doc.setFillColor(...primaryColor)
  doc.rect(125, yPos - 5, pageWidth - 145, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text(t('dashboard:subscription.invoicePdf.totalTtc'), 130, yPos + 3)
  doc.text(formatPrice(invoice.amount), pageWidth - 25, yPos + 3, { align: 'right' })

  // Payment status
  yPos += 25
  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')

  if (invoice.status === 'paid') {
    doc.setFillColor(220, 252, 231)
    doc.rect(20, yPos, 60, 10, 'F')
    doc.setTextColor(22, 163, 74)
    doc.setFont('helvetica', 'bold')
    doc.text(t('dashboard:subscription.invoicePdf.paid'), 30, yPos + 7)
  }

  // Footer
  yPos = 260
  doc.setTextColor(...grayColor)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(t('dashboard:subscription.invoicePdf.footerLegal'), pageWidth / 2, yPos, { align: 'center' })
  doc.text(t('dashboard:subscription.invoicePdf.footerContact', { email: CONTACT.billingEmail }), pageWidth / 2, yPos + 6, { align: 'center' })

  return doc
}

// PayPal icon component
const PayPalIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.217a.778.778 0 0 1 .768-.654h6.603c2.196 0 3.954.588 5.081 1.7 1.127 1.113 1.524 2.716 1.117 4.643-.03.139-.063.277-.1.412-.573 2.258-1.686 3.977-3.24 4.988-1.498.975-3.372 1.433-5.604 1.433h-1.66a.778.778 0 0 0-.768.654l-.822 5.205a.778.778 0 0 1-.768.654h-.475v.085z"/>
    <path d="M19.167 6.515c-.03.139-.063.277-.1.412-.573 2.258-1.686 3.977-3.24 4.988-1.498.975-3.372 1.433-5.604 1.433h-1.66a.778.778 0 0 0-.768.654l-.822 5.205-.466 2.947a.641.641 0 0 0 .633.74h3.378a.778.778 0 0 0 .768-.654l.676-4.283a.778.778 0 0 1 .768-.654h1.66c2.232 0 4.106-.458 5.604-1.433 1.554-1.011 2.667-2.73 3.24-4.988.037-.135.07-.273.1-.412.407-1.927.01-3.53-1.117-4.643-.41-.404-.907-.738-1.487-1.005.407.937.587 1.988.437 3.093z"/>
  </svg>
)

// Plans pour les particuliers (libellés/descriptions/features traduits via dashboard:subscription.plans.individual.ID)
const INDIVIDUAL_PLANS = [
  {
    id: 'free',
    price: 0,
    icon: FiStar,
    color: 'gray',
    featuresIncluded: [true, true, true, true, false, false, false],
    popular: false
  },
  {
    id: 'basic',
    price: 99,
    icon: FiZap,
    color: 'blue',
    featuresIncluded: [true, true, true, true, true, false, false],
    popular: true
  },
  {
    id: 'premium',
    price: 199,
    icon: FiAward,
    color: 'purple',
    featuresIncluded: [true, true, true, true, true, true, true],
    popular: false
  }
]

// Plans pour les agences (libellés/descriptions/features traduits via dashboard:subscription.plans.agency.ID)
const AGENCY_PLANS = [
  {
    id: 'starter',
    price: 299,
    icon: FiStar,
    color: 'gray',
    featuresIncluded: [true, true, true, true, false, false, false, false, false],
    popular: false
  },
  {
    id: 'pro',
    price: 799,
    icon: FiZap,
    color: 'blue',
    featuresIncluded: [true, true, true, true, true, true, true, true, false, false],
    popular: true
  },
  {
    id: 'enterprise',
    price: 1999,
    icon: FiAward,
    color: 'purple',
    featuresIncluded: [true, true, true, true, true, true, true, true, true, true],
    popular: false
  }
]

const STATUS_ICONS = {
  paid: { icon: FiCheckCircle, color: 'text-green-600 bg-green-100' },
  pending: { icon: FiClock, color: 'text-yellow-600 bg-yellow-100' },
  overdue: { icon: FiAlertCircle, color: 'text-red-600 bg-red-100' }
}

const COLOR_CLASSES = {
  gray: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: 'bg-gray-100 text-gray-600',
    button: 'bg-gray-600 hover:bg-gray-700'
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    icon: 'bg-blue-100 text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700'
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    icon: 'bg-purple-100 text-purple-600',
    button: 'bg-purple-600 hover:bg-purple-700'
  }
}

function PlanCard({ plan, planGroup, isCurrentPlan, onSelect }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const colors = COLOR_CLASSES[plan.color]
  const Icon = plan.icon
  const base = `dashboard:subscription.plans.${planGroup}.${plan.id}`
  const features = t(`${base}.features`, { returnObjects: true })

  return (
    <div
      className={`relative rounded-2xl border-2 ${plan.popular ? colors.border : 'border-gray-200'} ${colors.bg} p-6 transition-all hover:shadow-lg`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 bg-blue-600 text-white text-sm font-medium rounded-full">
            {t('dashboard:subscription.popular')}
          </span>
        </div>
      )}

      <div className="text-center mb-6">
        <div className={`w-14 h-14 rounded-xl ${colors.icon} flex items-center justify-center mx-auto mb-4`}>
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t(`${base}.name`)}</h3>
        <p className="text-sm text-gray-500 mt-1">{t(`${base}.description`)}</p>
        <div className="mt-4">
          <span className="text-4xl font-bold text-gray-900">
            {plan.price === 0 ? t('dashboard:subscription.free') : formatPrice(plan.price)}
          </span>
          {plan.price > 0 && <span className="text-gray-500">{t('dashboard:subscription.perMonth')}</span>}
        </div>
      </div>

      <ul className="space-y-3 mb-6">
        {features.map((featureText, i) => {
          const included = plan.featuresIncluded[i]
          return (
            <li key={i} className="flex items-center gap-3">
              {included ? (
                <FiCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <FiX className="w-5 h-5 text-gray-300 flex-shrink-0" />
              )}
              <span className={included ? 'text-gray-700' : 'text-gray-400'}>
                {featureText}
              </span>
            </li>
          )
        })}
      </ul>

      <button
        onClick={() => onSelect(plan, planGroup)}
        disabled={isCurrentPlan}
        className={`w-full py-3 rounded-xl font-semibold transition-colors ${
          isCurrentPlan
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : `${colors.button} text-white`
        }`}
      >
        {isCurrentPlan ? t('dashboard:subscription.currentPlan') : t(`${base}.cta`)}
      </button>
    </div>
  )
}

// Add Payment Modal Component
function AddPaymentModal({ isOpen, onClose, onAdd, type }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [paypalEmail, setPaypalEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = matches && matches[0] || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    return parts.length ? parts.join(' ') : value
  }

  const formatExpiry = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      let paymentData
      if (type === 'card') {
        // Get last 4 digits without spaces
        const cleanCardNumber = cardNumber.replace(/\s/g, '')
        paymentData = {
          type: 'card',
          last4: cleanCardNumber.slice(-4),
          brand: 'visa',
          expiry: expiryDate,
          name: cardName
        }
      } else {
        paymentData = {
          type: 'paypal',
          email: paypalEmail
        }
      }

      await onAdd(paymentData)
      // Reset form and close on success
      setCardNumber('')
      setCardName('')
      setExpiryDate('')
      setCvv('')
      setPaypalEmail('')
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || t('dashboard:subscription.addPaymentModal.genericError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {type === 'card' ? t('dashboard:subscription.addPaymentModal.titleCard') : t('dashboard:subscription.addPaymentModal.titlePaypal')}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            {type === 'card' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:subscription.addPaymentModal.cardNumber')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                      maxLength={19}
                      placeholder="1234 5678 9012 3456"
                      className="w-full ps-12 pe-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                    <FiCreditCard className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:subscription.addPaymentModal.cardName')}</label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={e => setCardName(e.target.value.toUpperCase())}
                    placeholder="JOHN DOE"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:subscription.addPaymentModal.expiryDate')}</label>
                    <input
                      type="text"
                      value={expiryDate}
                      onChange={e => setExpiryDate(formatExpiry(e.target.value))}
                      maxLength={5}
                      placeholder="MM/AA"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:subscription.addPaymentModal.cvv')}</label>
                    <input
                      type="text"
                      value={cvv}
                      onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                      placeholder="123"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4 text-green-500" />
                  {t('dashboard:subscription.addPaymentModal.securePayment')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <PayPalIcon className="w-10 h-10 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">PayPal</p>
                      <p className="text-sm text-gray-600">{t('dashboard:subscription.addPaymentModal.paypalDesc')}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:subscription.addPaymentModal.paypalEmail')}</label>
                  <input
                    type="email"
                    value={paypalEmail}
                    onChange={e => setPaypalEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {t('dashboard:subscription.addPaymentModal.paypalRedirectNote')}
                </p>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                {t('dashboard:shared.actions.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? t('dashboard:shared.actions.saving') : t('dashboard:shared.actions.add')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function Subscription() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { fmtDate } = useFormat()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('plans')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentModalType, setPaymentModalType] = useState('card')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedPlanGroup, setSelectedPlanGroup] = useState('individual')
  const [processing, setProcessing] = useState(false)
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false)
  const isAgency = user?.user_type === 'professional' || user?.user_type === 'admin'
  const planGroup = isAgency ? 'agency' : 'individual'

  // Plans from frontend constants (can also fetch from backend)
  const plans = isAgency ? AGENCY_PLANS : INDIVIDUAL_PLANS

  // Fetch current subscription from backend
  const { data: subscriptionData, isLoading: loadingSubscription, refetch: refetchSubscription } = useQuery(
    'currentSubscription',
    async () => {
      const { data } = await api.get('/subscription/current')
      return data
    },
    { enabled: !!user }
  )

  // Fetch payment methods from backend
  const { data: paymentMethodsData, isLoading: loadingPaymentMethods, refetch: refetchPaymentMethods } = useQuery(
    'paymentMethods',
    async () => {
      const { data } = await api.get('/payment-methods')
      return data.payment_methods || []
    },
    { enabled: !!user }
  )

  // Fetch invoices from backend
  const { data: invoicesData, isLoading: loadingInvoices, refetch: refetchInvoices } = useQuery(
    'invoices',
    async () => {
      const { data } = await api.get('/invoices')
      return data.invoices || []
    },
    { enabled: !!user }
  )

  // Get data from queries or use defaults
  const paymentMethods = paymentMethodsData || []
  const invoices = invoicesData || []
  const currentPlan = subscriptionData?.current_plan || (isAgency ? 'starter' : 'free')
  const activeSubscription = subscriptionData?.subscription
  const [showManageMenu, setShowManageMenu] = useState(false)

  const cancelMutation = useMutation(
    async () => {
      const { data } = await api.post('/cancel-subscription', null)
      return data
    },
    {
      onSuccess: () => {
        toast.success(t('dashboard:subscription.cancelledToast'))
        refetchSubscription()
        setShowManageMenu(false)
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || t('dashboard:subscription.cancelError'))
      }
    }
  )

  const handleCancelSubscription = () => {
    if (window.confirm(t('dashboard:subscription.cancelConfirm'))) {
      cancelMutation.mutate()
    }
  }

  // Add payment method mutation
  const addPaymentMutation = useMutation(
    async (paymentData) => {
      const { data } = await api.post('/payment-methods', paymentData)
      return data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('paymentMethods')
      }
    }
  )

  // Delete payment method mutation
  const deletePaymentMutation = useMutation(
    async (pmId) => {
      await api.delete(`/payment-methods/${pmId}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('paymentMethods')
      }
    }
  )

  // Set default payment method mutation
  const setDefaultPaymentMutation = useMutation(
    async (pmId) => {
      await api.post(`/payment-methods/${pmId}/set-default`, {})
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('paymentMethods')
      }
    }
  )

  // Change plan mutation
  const changePlanMutation = useMutation(
    async ({ planId, billingCycle }) => {
      const { data } = await api.post('/subscription/change-plan', {
        plan_id: planId,
        billing_cycle: billingCycle || 'monthly'
      })
      return data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('currentSubscription')
        queryClient.invalidateQueries('invoices')
      }
    }
  )

  const handleSelectPlan = (plan, group) => {
    // Check if user has a payment method
    if (paymentMethods.length === 0) {
      // No payment method - switch to billing tab and prompt to add one
      setActiveTab('billing')
      return
    }

    // Show confirmation modal
    setSelectedPlan(plan)
    setSelectedPlanGroup(group)
    setShowConfirmModal(true)
  }

  const handleConfirmSubscription = async () => {
    if (!selectedPlan) return

    setProcessing(true)

    try {
      // Call API to change plan
      const result = await changePlanMutation.mutateAsync({
        planId: selectedPlan.id,
        billingCycle: 'monthly'
      })

      setProcessing(false)
      setShowConfirmModal(false)
      setSubscriptionSuccess(true)

      // Auto-download the invoice PDF if invoice was created
      if (result.invoice) {
        const invoiceForPdf = {
          reference: result.invoice.reference,
          amount: result.invoice.total,
          status: result.invoice.status,
          date: result.invoice.created_at,
          period: result.invoice.period_label,
          planName: t(`dashboard:subscription.plans.${selectedPlanGroup}.${selectedPlan.id}.name`)
        }
        const pdf = generateInvoicePDF(invoiceForPdf, user, t)
        pdf.save(`${result.invoice.reference}.pdf`)
      }

      // Hide success message after 5 seconds
      setTimeout(() => setSubscriptionSuccess(false), 5000)
    } catch (error) {
      console.error('Error changing plan:', error)
      setProcessing(false)
      alert(error.response?.data?.error || t('dashboard:subscription.confirmModal.planChangeError'))
    }
  }

  const handleDownloadPDF = async (invoice) => {
    // Try to download from backend first
    try {
      const response = await api.get(`/invoices/${invoice.id}/pdf`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${invoice.reference}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      // Fallback to client-side generation
      const invoiceForPdf = {
        reference: invoice.reference,
        amount: invoice.total || invoice.amount,
        status: invoice.status,
        date: invoice.created_at || invoice.date,
        period: invoice.period_label || invoice.period,
        planName: invoice.planName || t('dashboard:subscription.genericPlanLabel')
      }
      const pdf = generateInvoicePDF(invoiceForPdf, user, t)
      pdf.save(`${invoice.reference}.pdf`)
    }
  }

  const handleAddPayment = async (payment) => {
    // This will throw if it fails, which the modal will catch
    await addPaymentMutation.mutateAsync(payment)
  }

  const handleSetDefaultPayment = async (id) => {
    try {
      await setDefaultPaymentMutation.mutateAsync(id)
    } catch (error) {
      console.error('Error setting default payment:', error)
    }
  }

  const handleDeletePayment = async (id) => {
    if (window.confirm(t('dashboard:subscription.paymentMethods.deleteConfirm'))) {
      try {
        await deletePaymentMutation.mutateAsync(id)
      } catch (error) {
        console.error('Error deleting payment method:', error)
      }
    }
  }

  const openPaymentModal = (type) => {
    setPaymentModalType(type)
    setShowPaymentModal(true)
  }

  const currentPlanData = plans.find(p => p.id === currentPlan)
  const isLoading = loadingSubscription || loadingPaymentMethods || loadingInvoices

  // Show loading state
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
          <span className="ms-3 text-gray-600">{t('dashboard:subscription.loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard:subscription.title')}</h1>
        <p className="text-gray-500">
          {isAgency
            ? t('dashboard:subscription.subtitleAgency')
            : t('dashboard:subscription.subtitleIndividual')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'plans'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('dashboard:subscription.tabs.plans')}
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'billing'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('dashboard:subscription.tabs.billing')}
        </button>
      </div>

      {activeTab === 'plans' && (
        <>
          {/* Current plan summary */}
          {currentPlanData && currentPlan !== 'free' && (
            <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-6 text-white mb-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                      {t('dashboard:subscription.currentPlanBadge', { name: t(`dashboard:subscription.plans.${planGroup}.${currentPlanData.id}.name`) })}
                    </span>
                    <span className="px-3 py-1 bg-green-400/20 text-green-100 rounded-full text-sm font-medium">
                      {t('dashboard:subscription.active')}
                    </span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatPrice(currentPlanData.price)}<span className="text-lg font-normal opacity-80">{t('dashboard:subscription.perMonth')}</span>
                  </p>
                  {activeSubscription?.end_date && (
                    <p className="opacity-80 text-sm mt-1">
                      {t('dashboard:subscription.nextPayment', { date: fmtDate(activeSubscription.end_date, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                    </p>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowManageMenu(!showManageMenu)}
                    className="px-6 py-3 bg-white text-primary-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                  >
                    {t('dashboard:subscription.manage')}
                  </button>
                  {showManageMenu && (
                    <div className="absolute end-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10 text-gray-900">
                      <button
                        onClick={() => { setActiveTab('billing'); setShowManageMenu(false) }}
                        className="w-full text-start px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        {t('dashboard:subscription.viewBilling')}
                      </button>
                      <button
                        onClick={handleCancelSubscription}
                        disabled={cancelMutation.isLoading}
                        className="w-full text-start px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {cancelMutation.isLoading ? t('dashboard:subscription.cancelling') : t('dashboard:subscription.cancelSubscription')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Plans grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                planGroup={planGroup}
                isCurrentPlan={plan.id === currentPlan}
                onSelect={handleSelectPlan}
              />
            ))}
          </div>

          {/* FAQ or additional info */}
          <div className="bg-gray-50 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 mb-4">{t('dashboard:subscription.faq.title')}</h3>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-gray-900">{t('dashboard:subscription.faq.q1.question')}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {t('dashboard:subscription.faq.q1.answer')}
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-900">{t('dashboard:subscription.faq.q2.question')}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {t('dashboard:subscription.faq.q2.answer')}
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-900">{t('dashboard:subscription.faq.q3.question')}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {t('dashboard:subscription.faq.q3.answer')}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'billing' && (
        <>
          {/* Payment methods */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:subscription.paymentMethods.title')}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => openPaymentModal('card')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <FiCreditCard className="w-4 h-4" />
                  {t('dashboard:subscription.paymentMethods.addCard')}
                </button>
                <button
                  onClick={() => openPaymentModal('paypal')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <PayPalIcon className="w-4 h-4" />
                  {t('dashboard:subscription.paymentMethods.addPaypal')}
                </button>
              </div>
            </div>

            {paymentMethods.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <FiCreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{t('dashboard:subscription.paymentMethods.empty')}</p>
                <p className="text-sm text-gray-400 mt-1">{t('dashboard:subscription.paymentMethods.emptyHint')}</p>
                <div className="flex justify-center gap-3 mt-4">
                  <button
                    onClick={() => openPaymentModal('card')}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <FiPlus className="w-4 h-4" />
                    {t('dashboard:subscription.paymentMethods.addCardButton')}
                  </button>
                  <button
                    onClick={() => openPaymentModal('paypal')}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    <PayPalIcon className="w-4 h-4" />
                    {t('dashboard:subscription.paymentMethods.addPaypal')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map(pm => (
                  <div key={pm.id} className={`flex items-center justify-between p-4 rounded-xl border-2 ${pm.isDefault ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-4">
                      {pm.type === 'card' ? (
                        <div className="w-14 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center shadow-sm">
                          <FiCreditCard className="w-6 h-6 text-white" />
                        </div>
                      ) : (
                        <div className="w-14 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-sm">
                          <PayPalIcon className="w-6 h-6 text-white" />
                        </div>
                      )}
                      <div>
                        {pm.type === 'card' ? (
                          <>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{pm.brand} •••• {pm.last4}</p>
                              {pm.isDefault && (
                                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                                  {t('dashboard:subscription.paymentMethods.default')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{t('dashboard:subscription.paymentMethods.expires', { expiry: pm.expiry, name: pm.name })}</p>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">PayPal</p>
                              {pm.isDefault && (
                                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                                  {t('dashboard:subscription.paymentMethods.default')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{pm.email}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!pm.isDefault && (
                        <button
                          onClick={() => handleSetDefaultPayment(pm.id)}
                          className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          {t('dashboard:subscription.paymentMethods.setDefault')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePayment(pm.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:subscription.invoices.title')}</h2>
            </div>

            {currentPlan === 'free' ? (
              <div className="p-12 text-center">
                <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('dashboard:subscription.invoices.empty.title')}</h3>
                <p className="text-gray-500">{t('dashboard:subscription.invoices.empty.description')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('dashboard:subscription.invoices.columns.reference')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('dashboard:subscription.invoices.columns.period')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('dashboard:subscription.invoices.columns.date')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('dashboard:subscription.invoices.columns.amount')}
                      </th>
                      <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('dashboard:subscription.invoices.columns.status')}
                      </th>
                      <th className="px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('dashboard:subscription.invoices.columns.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoices.map(invoice => {
                      const statusIcon = STATUS_ICONS[invoice.status] || STATUS_ICONS.pending
                      const StatusIcon = statusIcon.icon
                      // Handle both backend and local data format
                      const period = invoice.period_label || invoice.period
                      const date = invoice.created_at || invoice.date
                      const amount = invoice.total || invoice.amount

                      return (
                        <tr key={invoice.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <span className="font-medium text-gray-900">{invoice.reference}</span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {period}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {fmtDate(date)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-gray-900">
                              {formatPrice(amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusIcon.color}`}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {t(`dashboard:subscription.invoices.status.${invoice.status}`, { defaultValue: invoice.status })}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-end">
                            <button
                              onClick={() => handleDownloadPDF(invoice)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                              <FiDownload className="w-4 h-4" />
                              {t('dashboard:subscription.invoices.downloadPdf')}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Payment Modal */}
      <AddPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onAdd={handleAddPayment}
        type={paymentModalType}
      />

      {/* Subscription Confirmation Modal */}
      {showConfirmModal && selectedPlan && (() => {
        const selectedPlanName = t(`dashboard:subscription.plans.${selectedPlanGroup}.${selectedPlan.id}.name`)
        return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => !processing && setShowConfirmModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full ${COLOR_CLASSES[selectedPlan.color].icon} flex items-center justify-center mx-auto mb-4`}>
                  {(() => {
                    const Icon = selectedPlan.icon
                    return <Icon className="w-8 h-8" />
                  })()}
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {t('dashboard:subscription.confirmModal.title')}
                </h2>
                <p className="text-gray-600">
                  {t('dashboard:subscription.confirmModal.subscribeToPrefix')} <strong>{selectedPlanName}</strong>
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">{t('dashboard:subscription.confirmModal.plan', { name: selectedPlanName })}</span>
                  <span className="font-semibold text-gray-900">{formatPrice(selectedPlan.price)}{t('dashboard:subscription.perMonth')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">{t('dashboard:subscription.confirmModal.paymentMethod')}</span>
                  <span className="text-gray-700">
                    {paymentMethods.find(pm => pm.isDefault)?.type === 'card'
                      ? `•••• ${paymentMethods.find(pm => pm.isDefault)?.last4}`
                      : 'PayPal'
                    }
                  </span>
                </div>
                <div className="border-t border-gray-200 mt-3 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-900">{t('dashboard:subscription.confirmModal.totalToday')}</span>
                    <span className="text-lg font-bold text-primary-600">{formatPrice(selectedPlan.price)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('dashboard:subscription.confirmModal.trialNote', { price: formatPrice(selectedPlan.price) })}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('dashboard:shared.actions.cancel')}
                </button>
                <button
                  onClick={handleConfirmSubscription}
                  disabled={processing}
                  className={`flex-1 px-4 py-3 ${COLOR_CLASSES[selectedPlan.color].button} text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2`}
                >
                  {processing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {t('dashboard:subscription.confirmModal.confirming')}
                    </>
                  ) : (
                    <>
                      <FiCheck className="w-5 h-5" />
                      {t('dashboard:shared.actions.confirm')}
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center mt-4">
                {t('dashboard:subscription.confirmModal.termsNote')}
              </p>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Success Message */}
      {subscriptionSuccess && (
        <div className="fixed bottom-6 end-6 z-50 animate-slide-up">
          <div className="bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <FiCheckCircle className="w-6 h-6" />
            <div>
              <p className="font-medium">{t('dashboard:subscription.successToast.title')}</p>
              <p className="text-sm text-green-100">{t('dashboard:subscription.successToast.message')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
