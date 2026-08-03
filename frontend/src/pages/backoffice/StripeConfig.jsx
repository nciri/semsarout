import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  FiCreditCard, FiKey, FiCheck, FiAlertCircle, FiEye, FiEyeOff,
  FiRefreshCw, FiExternalLink, FiSettings, FiDollarSign, FiPercent,
  FiToggleLeft, FiToggleRight, FiSave, FiShield
} from 'react-icons/fi'
import useAuthStore from '../../store/authStore'

// Stripe logo component
const StripeLogo = ({ className }) => (
  <svg className={className} viewBox="0 0 60 25" fill="currentColor">
    <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.02 1.04-.06 1.48zm-6.04-5.88c-1.2 0-2.16.94-2.36 2.72h4.52c-.08-1.63-.82-2.72-2.16-2.72zm-11.3 10.48c-1.4 0-2.2-.44-2.2-1.43 0-.74.52-1.24 1.44-1.24.94 0 1.8.33 2.56.74v1.43c-.76.33-1.38.5-1.8.5zm-1.24-7.9c0-1.22.82-2.18 2.76-2.18.86 0 1.9.2 2.8.6V6.14a7.72 7.72 0 0 0-3.02-.56c-4.08 0-6.44 2.16-6.44 5.7 0 2.44 1.16 4.04 3.22 4.98l-.1.04c-1.66.58-2.84 1.78-2.84 3.54 0 1.38.78 2.34 2.06 2.86l-.06.02c-1.36.46-2.7 1.52-2.7 3.42 0 2.7 2.34 4.08 6.14 4.08 4.38 0 6.68-2.02 6.68-5.1 0-2.5-1.44-3.94-4.76-4.4l-1.68-.24c-.72-.1-1.04-.38-1.04-.78 0-.36.24-.68.62-.94.4.1.84.16 1.3.16 3.04 0 5.04-1.64 5.04-4.44 0-.98-.28-1.86-.78-2.58h2.22V8.96h-4.52c-.56-.22-1.26-.36-2-.36-3.28 0-5.14 2.14-5.14 4.9 0 1.44.54 2.7 1.44 3.54v.04c-.48.34-.72.78-.72 1.26 0 .62.38 1.1 1.1 1.4v.04c-1.1.42-1.88 1.24-1.88 2.34 0 .08.02.16.02.24H38v-3.06c.62.2 1.32.3 2.06.3zm0-4.7c-.98 0-1.7-.74-1.7-1.82s.72-1.82 1.7-1.82c.98 0 1.7.74 1.7 1.82s-.72 1.82-1.7 1.82zm-10.7 9.28c-1.28 0-2.06-.58-2.06-1.56 0-.82.56-1.36 1.56-1.36 1.02 0 1.96.4 2.76.9v1.52c-.78.34-1.5.5-2.26.5zm-1.04-7.9c0-1.22.82-2.18 2.76-2.18.86 0 1.9.2 2.8.6V6.14a7.72 7.72 0 0 0-3.02-.56c-4.08 0-6.44 2.16-6.44 5.7 0 2.44 1.16 4.04 3.22 4.98l-.1.04c-1.66.58-2.84 1.78-2.84 3.54 0 1.38.78 2.34 2.06 2.86l-.06.02c-1.36.46-2.7 1.52-2.7 3.42 0 2.7 2.34 4.08 6.14 4.08 4.38 0 6.68-2.02 6.68-5.1 0-2.5-1.44-3.94-4.76-4.4l-1.68-.24c-.72-.1-1.04-.38-1.04-.78 0-.36.24-.68.62-.94.4.1.84.16 1.3.16 3.04 0 5.04-1.64 5.04-4.44 0-.98-.28-1.86-.78-2.58h2.22V8.96h-4.52c-.56-.22-1.26-.36-2-.36-3.28 0-5.14 2.14-5.14 4.9 0 1.44.54 2.7 1.44 3.54v.04c-.48.34-.72.78-.72 1.26 0 .62.38 1.1 1.1 1.4v.04c-1.1.42-1.88 1.24-1.88 2.34 0 .08.02.16.02.24H26v-3.06c.62.2 1.32.3 2.06.3zm0-4.7c-.98 0-1.7-.74-1.7-1.82s.72-1.82 1.7-1.82c.98 0 1.7.74 1.7 1.82s-.72 1.82-1.7 1.82zM18.94 5.3c3.36 0 5.5 2.56 5.5 6.86 0 4.34-2.2 6.86-5.5 6.86-1.54 0-2.76-.64-3.62-1.7v6.86h-4.2V5.58h4.02v1.54c.84-1.14 2.12-1.82 3.8-1.82zm-1.24 10c1.42 0 2.36-1.14 2.36-3.14s-.94-3.14-2.36-3.14c-1.42 0-2.36 1.14-2.36 3.14s.94 3.14 2.36 3.14zM5.36 5.58h4.2v13.22h-4.2V5.58zM7.46 0c1.42 0 2.5 1.06 2.5 2.42 0 1.36-1.08 2.42-2.5 2.42S4.96 3.78 4.96 2.42C4.96 1.06 6.04 0 7.46 0zM0 18.8h4.2V5.58H0V18.8z"/>
  </svg>
)

export default function StripeConfig() {
  const { user } = useAuthStore()
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState(null)

  // Mock config state
  const [config, setConfig] = useState({
    liveMode: false,
    publishableKey: 'pk_test_51ABC...',
    secretKey: 'sk_test_51ABC...',
    webhookSecret: 'whsec_...',
    currency: 'MAD',
    commissionRate: 5,
    autoCapture: true,
    enablePaypal: false,
    paypalClientId: '',
    paypalClientSecret: '',
  })

  // Check if user is admin
  if (user?.role !== 'admin') {
    return <Navigate to="/backoffice" replace />
  }

  const handleSave = async () => {
    setSaving(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    setSaving(false)
    alert('Configuration Stripe enregistrée avec succès!')
  }

  const testConnection = async () => {
    setTestingConnection(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setTestingConnection(false)
    setConnectionStatus('success')
    setTimeout(() => setConnectionStatus(null), 5000)
  }

  const maskKey = (key) => {
    if (!key || key.length < 12) return key
    return key.substring(0, 8) + '...' + key.substring(key.length - 4)
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <StripeLogo className="h-8 text-indigo-600" />
            <span className="text-xs font-medium px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">
              Admin uniquement
            </span>
          </div>
          <p className="text-gray-500">Configurez les paramètres de paiement Stripe pour votre plateforme</p>
        </div>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <FiExternalLink className="w-4 h-4" />
          Dashboard Stripe
        </a>
      </div>

      {/* Status Banner */}
      <div className={`mb-6 p-4 rounded-xl flex items-center gap-4 ${config.liveMode ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${config.liveMode ? 'bg-green-100' : 'bg-yellow-100'}`}>
          {config.liveMode ? (
            <FiShield className="w-6 h-6 text-green-600" />
          ) : (
            <FiAlertCircle className="w-6 h-6 text-yellow-600" />
          )}
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold ${config.liveMode ? 'text-green-800' : 'text-yellow-800'}`}>
            Mode {config.liveMode ? 'Production' : 'Test'}
          </h3>
          <p className={`text-sm ${config.liveMode ? 'text-green-600' : 'text-yellow-600'}`}>
            {config.liveMode
              ? 'Les paiements réels sont activés. Les clients seront facturés.'
              : 'Les paiements sont simulés. Utilisez les cartes de test Stripe.'}
          </p>
        </div>
        <button
          onClick={() => setConfig({ ...config, liveMode: !config.liveMode })}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            config.liveMode
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-yellow-600 text-white hover:bg-yellow-700'
          }`}
        >
          {config.liveMode ? 'Passer en test' : 'Passer en production'}
        </button>
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <FiKey className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Clés API</h2>
            <p className="text-sm text-gray-500">Clés d'accès à l'API Stripe</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Clé publique (Publishable Key)
            </label>
            <div className="relative">
              <input
                type="text"
                value={config.publishableKey}
                onChange={e => setConfig({ ...config, publishableKey: e.target.value })}
                placeholder="pk_test_..."
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
              <FiKey className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Clé secrète (Secret Key)
            </label>
            <div className="relative">
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={config.secretKey}
                onChange={e => setConfig({ ...config, secretKey: e.target.value })}
                placeholder="sk_test_..."
                className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
              <FiKey className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecretKey ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <FiAlertCircle className="w-3 h-3" />
              Ne partagez jamais cette clé
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Secret Webhook
            </label>
            <div className="relative">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={config.webhookSecret}
                onChange={e => setConfig({ ...config, webhookSecret: e.target.value })}
                placeholder="whsec_..."
                className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
              <FiKey className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <button
                type="button"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showWebhookSecret ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={testConnection}
              disabled={testingConnection}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <FiRefreshCw className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
              {testingConnection ? 'Test en cours...' : 'Tester la connexion'}
            </button>
            {connectionStatus === 'success' && (
              <span className="flex items-center gap-2 text-green-600">
                <FiCheck className="w-5 h-5" />
                Connexion réussie
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Payment Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <FiSettings className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Paramètres de paiement</h2>
            <p className="text-sm text-gray-500">Configurez les options de facturation</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Devise
              </label>
              <div className="relative">
                <select
                  value={config.currency}
                  onChange={e => setConfig({ ...config, currency: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
                >
                  <option value="MAD">Dirham marocain (Đh)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="USD">Dollar US (USD)</option>
                </select>
                <FiDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Commission plateforme (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={config.commissionRate}
                  onChange={e => setConfig({ ...config, commissionRate: parseFloat(e.target.value) })}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <FiPercent className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Capture automatique</p>
              <p className="text-sm text-gray-500">Capturer automatiquement les paiements lors de la facturation</p>
            </div>
            <button
              onClick={() => setConfig({ ...config, autoCapture: !config.autoCapture })}
              className="text-indigo-600"
            >
              {config.autoCapture ? (
                <FiToggleRight className="w-8 h-8" />
              ) : (
                <FiToggleLeft className="w-8 h-8 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* PayPal Integration */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.217a.778.778 0 0 1 .768-.654h6.603c2.196 0 3.954.588 5.081 1.7 1.127 1.113 1.524 2.716 1.117 4.643-.03.139-.063.277-.1.412-.573 2.258-1.686 3.977-3.24 4.988-1.498.975-3.372 1.433-5.604 1.433h-1.66a.778.778 0 0 0-.768.654l-.822 5.205a.778.778 0 0 1-.768.654h-.475v.085z"/>
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">PayPal</h2>
              <p className="text-sm text-gray-500">Accepter les paiements PayPal</p>
            </div>
          </div>
          <button
            onClick={() => setConfig({ ...config, enablePaypal: !config.enablePaypal })}
            className="text-indigo-600"
          >
            {config.enablePaypal ? (
              <FiToggleRight className="w-8 h-8" />
            ) : (
              <FiToggleLeft className="w-8 h-8 text-gray-400" />
            )}
          </button>
        </div>

        {config.enablePaypal && (
          <div className="space-y-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client ID
              </label>
              <input
                type="text"
                value={config.paypalClientId}
                onChange={e => setConfig({ ...config, paypalClientId: e.target.value })}
                placeholder="AXxx..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Secret
              </label>
              <input
                type="password"
                value={config.paypalClientSecret}
                onChange={e => setConfig({ ...config, paypalClientSecret: e.target.value })}
                placeholder="ELxx..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <FiSave className="w-5 h-5" />
          {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
        </button>
      </div>
    </div>
  )
}
