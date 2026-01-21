import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import {
  FiCheck, FiX, FiCreditCard, FiDownload, FiCheckCircle, FiClock,
  FiAlertCircle, FiCalendar, FiArrowRight, FiStar, FiZap, FiAward,
  FiPlus, FiTrash2, FiEdit2
} from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
import { formatPrice } from '../../utils/currency'

// PayPal icon component
const PayPalIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.217a.778.778 0 0 1 .768-.654h6.603c2.196 0 3.954.588 5.081 1.7 1.127 1.113 1.524 2.716 1.117 4.643-.03.139-.063.277-.1.412-.573 2.258-1.686 3.977-3.24 4.988-1.498.975-3.372 1.433-5.604 1.433h-1.66a.778.778 0 0 0-.768.654l-.822 5.205a.778.778 0 0 1-.768.654h-.475v.085z"/>
    <path d="M19.167 6.515c-.03.139-.063.277-.1.412-.573 2.258-1.686 3.977-3.24 4.988-1.498.975-3.372 1.433-5.604 1.433h-1.66a.778.778 0 0 0-.768.654l-.822 5.205-.466 2.947a.641.641 0 0 0 .633.74h3.378a.778.778 0 0 0 .768-.654l.676-4.283a.778.778 0 0 1 .768-.654h1.66c2.232 0 4.106-.458 5.604-1.433 1.554-1.011 2.667-2.73 3.24-4.988.037-.135.07-.273.1-.412.407-1.927.01-3.53-1.117-4.643-.41-.404-.907-.738-1.487-1.005.407.937.587 1.988.437 3.093z"/>
  </svg>
)

// Plans pour les particuliers
const INDIVIDUAL_PLANS = [
  {
    id: 'free',
    name: 'Gratuit',
    price: 0,
    period: '',
    description: 'Pour publier votre premier bien',
    icon: FiStar,
    color: 'gray',
    features: [
      { text: '1 annonce active', included: true },
      { text: 'Photos (max 5)', included: true },
      { text: 'Durée 30 jours', included: true },
      { text: 'Statistiques basiques', included: true },
      { text: 'Badge Premium', included: false },
      { text: 'Mise en avant', included: false },
      { text: 'Support prioritaire', included: false },
    ],
    cta: 'Plan actuel',
    popular: false
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 99,
    period: '/mois',
    description: 'Pour les vendeurs actifs',
    icon: FiZap,
    color: 'blue',
    features: [
      { text: '5 annonces actives', included: true },
      { text: 'Photos illimitées', included: true },
      { text: 'Durée 60 jours', included: true },
      { text: 'Statistiques détaillées', included: true },
      { text: '1 Badge Premium/mois', included: true },
      { text: 'Mise en avant', included: false },
      { text: 'Support prioritaire', included: false },
    ],
    cta: 'Choisir Basic',
    popular: true
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    period: '/mois',
    description: 'Visibilité maximale',
    icon: FiAward,
    color: 'purple',
    features: [
      { text: 'Annonces illimitées', included: true },
      { text: 'Photos illimitées', included: true },
      { text: 'Durée illimitée', included: true },
      { text: 'Statistiques avancées', included: true },
      { text: 'Badges Premium illimités', included: true },
      { text: '3 mises en avant/mois', included: true },
      { text: 'Support prioritaire', included: true },
    ],
    cta: 'Choisir Premium',
    popular: false
  }
]

// Plans pour les agences
const AGENCY_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299,
    period: '/mois',
    description: 'Pour démarrer votre activité',
    icon: FiStar,
    color: 'gray',
    features: [
      { text: '10 annonces actives', included: true },
      { text: 'Photos illimitées', included: true },
      { text: '1 utilisateur', included: true },
      { text: 'Statistiques basiques', included: true },
      { text: 'Import CSV', included: false },
      { text: 'API & Intégrations', included: false },
      { text: 'CRM & Pipeline', included: false },
      { text: 'Support prioritaire', included: false },
    ],
    cta: 'Choisir Starter',
    popular: false
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 799,
    period: '/mois',
    description: 'Pour les agences en croissance',
    icon: FiZap,
    color: 'blue',
    features: [
      { text: '50 annonces actives', included: true },
      { text: 'Photos illimitées', included: true },
      { text: '5 utilisateurs', included: true },
      { text: 'Statistiques avancées', included: true },
      { text: 'Import CSV', included: true },
      { text: 'API & Intégrations', included: true },
      { text: 'CRM & Pipeline', included: true },
      { text: 'Support prioritaire', included: false },
    ],
    cta: 'Choisir Pro',
    popular: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 1999,
    period: '/mois',
    description: 'Solution complète pour grandes agences',
    icon: FiAward,
    color: 'purple',
    features: [
      { text: 'Annonces illimitées', included: true },
      { text: 'Photos illimitées', included: true },
      { text: 'Utilisateurs illimités', included: true },
      { text: 'Analytics personnalisés', included: true },
      { text: 'Import CSV avancé', included: true },
      { text: 'API complète & Webhooks', included: true },
      { text: 'CRM complet & StayManager', included: true },
      { text: 'Support dédié 24/7', included: true },
    ],
    cta: 'Contacter les ventes',
    popular: false
  }
]

const STATUS_CONFIG = {
  paid: { label: 'Payée', icon: FiCheckCircle, color: 'text-green-600 bg-green-100' },
  pending: { label: 'En attente', icon: FiClock, color: 'text-yellow-600 bg-yellow-100' },
  overdue: { label: 'En retard', icon: FiAlertCircle, color: 'text-red-600 bg-red-100' }
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

function PlanCard({ plan, isCurrentPlan, onSelect }) {
  const colors = COLOR_CLASSES[plan.color]
  const Icon = plan.icon

  return (
    <div
      className={`relative rounded-2xl border-2 ${plan.popular ? colors.border : 'border-gray-200'} ${colors.bg} p-6 transition-all hover:shadow-lg`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 bg-blue-600 text-white text-sm font-medium rounded-full">
            Populaire
          </span>
        </div>
      )}

      <div className="text-center mb-6">
        <div className={`w-14 h-14 rounded-xl ${colors.icon} flex items-center justify-center mx-auto mb-4`}>
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
        <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
        <div className="mt-4">
          <span className="text-4xl font-bold text-gray-900">
            {plan.price === 0 ? 'Gratuit' : formatPrice(plan.price)}
          </span>
          {plan.period && <span className="text-gray-500">{plan.period}</span>}
        </div>
      </div>

      <ul className="space-y-3 mb-6">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-center gap-3">
            {feature.included ? (
              <FiCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <FiX className="w-5 h-5 text-gray-300 flex-shrink-0" />
            )}
            <span className={feature.included ? 'text-gray-700' : 'text-gray-400'}>
              {feature.text}
            </span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan)}
        disabled={isCurrentPlan}
        className={`w-full py-3 rounded-xl font-semibold transition-colors ${
          isCurrentPlan
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : `${colors.button} text-white`
        }`}
      >
        {isCurrentPlan ? 'Plan actuel' : plan.cta}
      </button>
    </div>
  )
}

// Add Payment Modal Component
function AddPaymentModal({ isOpen, onClose, onAdd, type }) {
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [paypalEmail, setPaypalEmail] = useState('')
  const [saving, setSaving] = useState(false)

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
    await new Promise(resolve => setTimeout(resolve, 1500))
    setSaving(false)
    if (type === 'card') {
      onAdd({ type: 'card', last4: cardNumber.slice(-4), brand: 'Visa', expiry: expiryDate, name: cardName })
    } else {
      onAdd({ type: 'paypal', email: paypalEmail })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {type === 'card' ? 'Ajouter une carte bancaire' : 'Lier un compte PayPal'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {type === 'card' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Numéro de carte</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                      maxLength={19}
                      placeholder="1234 5678 9012 3456"
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                    <FiCreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nom sur la carte</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date d'expiration</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">CVV</label>
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
                  Paiement sécurisé par Stripe
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <PayPalIcon className="w-10 h-10 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">PayPal</p>
                      <p className="text-sm text-gray-600">Liez votre compte PayPal pour des paiements rapides</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email PayPal</label>
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
                  Vous serez redirigé vers PayPal pour autoriser la connexion
                </p>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function Subscription() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('plans')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentModalType, setPaymentModalType] = useState('card')
  const isAgency = user?.user_type === 'professional'

  // Mock data for current subscription
  const currentPlan = isAgency ? 'starter' : 'free'
  const plans = isAgency ? AGENCY_PLANS : INDIVIDUAL_PLANS

  // Mock payment methods
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 1, type: 'card', brand: 'Visa', last4: '4242', expiry: '12/27', name: 'AHMED BENALI', isDefault: true },
  ])

  // Mock invoices
  const invoices = [
    { id: 1, reference: 'INV-2026-001', amount: isAgency ? 299 : 99, status: 'paid', date: '2026-01-01', period: 'Janvier 2026' },
    { id: 2, reference: 'INV-2025-012', amount: isAgency ? 299 : 99, status: 'paid', date: '2025-12-01', period: 'Décembre 2025' },
    { id: 3, reference: 'INV-2025-011', amount: isAgency ? 299 : 99, status: 'paid', date: '2025-11-01', period: 'Novembre 2025' },
  ]

  const handleSelectPlan = (plan) => {
    // Redirect to checkout or show payment modal
    console.log('Selected plan:', plan)
    alert(`Vous avez sélectionné le plan ${plan.name}. La page de paiement sera disponible prochainement.`)
  }

  const handleAddPayment = (payment) => {
    const newPayment = {
      id: Date.now(),
      isDefault: paymentMethods.length === 0,
      ...payment
    }
    setPaymentMethods([...paymentMethods, newPayment])
  }

  const handleSetDefaultPayment = (id) => {
    setPaymentMethods(paymentMethods.map(pm => ({ ...pm, isDefault: pm.id === id })))
  }

  const handleDeletePayment = (id) => {
    if (window.confirm('Supprimer ce moyen de paiement ?')) {
      const updated = paymentMethods.filter(pm => pm.id !== id)
      if (updated.length > 0 && !updated.some(pm => pm.isDefault)) {
        updated[0].isDefault = true
      }
      setPaymentMethods(updated)
    }
  }

  const openPaymentModal = (type) => {
    setPaymentModalType(type)
    setShowPaymentModal(true)
  }

  const currentPlanData = plans.find(p => p.id === currentPlan)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Mon abonnement</h1>
        <p className="text-gray-500">
          {isAgency
            ? 'Gérez votre abonnement agence et accédez à plus de fonctionnalités'
            : 'Publiez plus d\'annonces et boostez votre visibilité'}
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
          Plans & Tarifs
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'billing'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Facturation
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
                      Plan {currentPlanData.name}
                    </span>
                    <span className="px-3 py-1 bg-green-400/20 text-green-100 rounded-full text-sm font-medium">
                      Actif
                    </span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatPrice(currentPlanData.price)}<span className="text-lg font-normal opacity-80">/mois</span>
                  </p>
                  <p className="opacity-80 text-sm mt-1">
                    Prochain paiement le 1er février 2026
                  </p>
                </div>
                <button className="px-6 py-3 bg-white text-primary-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                  Gérer l'abonnement
                </button>
              </div>
            </div>
          )}

          {/* Plans grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={plan.id === currentPlan}
                onSelect={handleSelectPlan}
              />
            ))}
          </div>

          {/* FAQ or additional info */}
          <div className="bg-gray-50 rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Questions fréquentes</h3>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-gray-900">Puis-je changer de plan à tout moment ?</p>
                <p className="text-sm text-gray-600 mt-1">
                  Oui, vous pouvez passer à un plan supérieur à tout moment. Le changement prend effet immédiatement et la différence est calculée au prorata.
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Comment fonctionne la période d'essai ?</p>
                <p className="text-sm text-gray-600 mt-1">
                  Tous les plans payants bénéficient d'une période d'essai de 14 jours. Vous ne serez facturé qu'à la fin de cette période.
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Quels moyens de paiement acceptez-vous ?</p>
                <p className="text-sm text-gray-600 mt-1">
                  Nous acceptons les cartes bancaires (Visa, Mastercard) et les virements bancaires pour les plans Enterprise.
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
              <h2 className="text-lg font-semibold text-gray-900">Moyens de paiement</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => openPaymentModal('card')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <FiCreditCard className="w-4 h-4" />
                  Carte
                </button>
                <button
                  onClick={() => openPaymentModal('paypal')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <PayPalIcon className="w-4 h-4" />
                  PayPal
                </button>
              </div>
            </div>

            {paymentMethods.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                <FiCreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Aucun moyen de paiement enregistré</p>
                <p className="text-sm text-gray-400 mt-1">Ajoutez une carte bancaire ou liez votre compte PayPal</p>
                <div className="flex justify-center gap-3 mt-4">
                  <button
                    onClick={() => openPaymentModal('card')}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <FiPlus className="w-4 h-4" />
                    Ajouter une carte
                  </button>
                  <button
                    onClick={() => openPaymentModal('paypal')}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    <PayPalIcon className="w-4 h-4" />
                    PayPal
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
                                  Par défaut
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">Expire {pm.expiry} · {pm.name}</p>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">PayPal</p>
                              {pm.isDefault && (
                                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                                  Par défaut
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
                          Définir par défaut
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
              <h2 className="text-lg font-semibold text-gray-900">Historique des factures</h2>
            </div>

            {currentPlan === 'free' ? (
              <div className="p-12 text-center">
                <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune facture</h3>
                <p className="text-gray-500">Vos factures apparaîtront ici une fois que vous aurez souscrit à un plan payant</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Référence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Période
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Montant
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoices.map(invoice => {
                      const statusConfig = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.pending
                      const StatusIcon = statusConfig.icon

                      return (
                        <tr key={invoice.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <span className="font-medium text-gray-900">{invoice.reference}</span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {invoice.period}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {new Date(invoice.date).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-gray-900">
                              {formatPrice(invoice.amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                              <FiDownload className="w-4 h-4" />
                              PDF
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
    </div>
  )
}
