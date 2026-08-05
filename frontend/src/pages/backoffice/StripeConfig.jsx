import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiCreditCard, FiKey, FiCheck, FiAlertCircle, FiEye, FiEyeOff,
  FiRefreshCw, FiExternalLink, FiSettings, FiDollarSign, FiPercent,
  FiToggleLeft, FiToggleRight, FiSave, FiShield
} from 'react-icons/fi'
import useAuthStore from '../../store/authStore'

// Wordmark Stripe (le SVG inline précédent était corrompu). Rendu texte propre,
// aux couleurs de marque Stripe (#635BFF), toujours affichable.
const StripeLogo = ({ className }) => (
  <span
    className={`font-extrabold text-2xl lowercase tracking-tight leading-none ${className || ''}`}
    style={{ color: '#635BFF' }}
  >
    stripe
  </span>
)

export default function StripeConfig() {
  const { t } = useTranslation(['backoffice'])
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
    alert(t('backoffice:settings.stripe.save.successAlert'))
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
              {t('backoffice:settings.shared.adminOnly')}
            </span>
          </div>
          <p className="text-gray-500">{t('backoffice:settings.stripe.subtitle')}</p>
        </div>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <FiExternalLink className="w-4 h-4" />
          {t('backoffice:settings.stripe.dashboardLink')}
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
            {config.liveMode ? t('backoffice:settings.stripe.statusBanner.mode.production') : t('backoffice:settings.stripe.statusBanner.mode.test')}
          </h3>
          <p className={`text-sm ${config.liveMode ? 'text-green-600' : 'text-yellow-600'}`}>
            {config.liveMode
              ? t('backoffice:settings.stripe.statusBanner.description.production')
              : t('backoffice:settings.stripe.statusBanner.description.test')}
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
          {config.liveMode ? t('backoffice:settings.stripe.statusBanner.switchToTest') : t('backoffice:settings.stripe.statusBanner.switchToProduction')}
        </button>
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <FiKey className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{t('backoffice:settings.stripe.apiKeys.title')}</h2>
            <p className="text-sm text-gray-500">{t('backoffice:settings.stripe.apiKeys.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('backoffice:settings.stripe.apiKeys.publishableKey')}
            </label>
            <div className="relative">
              <input
                type="text"
                value={config.publishableKey}
                onChange={e => setConfig({ ...config, publishableKey: e.target.value })}
                placeholder="pk_test_..."
                className="w-full ps-12 pe-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
              <FiKey className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('backoffice:settings.stripe.apiKeys.secretKey')}
            </label>
            <div className="relative">
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={config.secretKey}
                onChange={e => setConfig({ ...config, secretKey: e.target.value })}
                placeholder="sk_test_..."
                className="w-full ps-12 pe-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
              <FiKey className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute end-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecretKey ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <FiAlertCircle className="w-3 h-3" />
              {t('backoffice:settings.stripe.apiKeys.secretKeyWarning')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('backoffice:settings.stripe.apiKeys.webhookSecret')}
            </label>
            <div className="relative">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={config.webhookSecret}
                onChange={e => setConfig({ ...config, webhookSecret: e.target.value })}
                placeholder="whsec_..."
                className="w-full ps-12 pe-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
              />
              <FiKey className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <button
                type="button"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                className="absolute end-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
              {testingConnection ? t('backoffice:settings.stripe.apiKeys.testingConnection') : t('backoffice:settings.stripe.apiKeys.testConnection')}
            </button>
            {connectionStatus === 'success' && (
              <span className="flex items-center gap-2 text-green-600">
                <FiCheck className="w-5 h-5" />
                {t('backoffice:settings.stripe.apiKeys.connectionSuccess')}
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
            <h2 className="font-semibold text-gray-900">{t('backoffice:settings.stripe.paymentSettings.title')}</h2>
            <p className="text-sm text-gray-500">{t('backoffice:settings.stripe.paymentSettings.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('backoffice:settings.stripe.paymentSettings.currency')}
              </label>
              <div className="relative">
                <select
                  value={config.currency}
                  onChange={e => setConfig({ ...config, currency: e.target.value })}
                  className="w-full ps-12 pe-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
                >
                  <option value="MAD">{t('backoffice:settings.stripe.paymentSettings.currencyOptions.mad')}</option>
                  <option value="EUR">{t('backoffice:settings.stripe.paymentSettings.currencyOptions.eur')}</option>
                  <option value="USD">{t('backoffice:settings.stripe.paymentSettings.currencyOptions.usd')}</option>
                </select>
                <FiDollarSign className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('backoffice:settings.stripe.paymentSettings.commissionRate')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={config.commissionRate}
                  onChange={e => setConfig({ ...config, commissionRate: parseFloat(e.target.value) })}
                  className="w-full ps-12 pe-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <FiPercent className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">{t('backoffice:settings.stripe.paymentSettings.autoCapture.title')}</p>
              <p className="text-sm text-gray-500">{t('backoffice:settings.stripe.paymentSettings.autoCapture.description')}</p>
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
              <h2 className="font-semibold text-gray-900">{t('backoffice:settings.stripe.paypal.title')}</h2>
              <p className="text-sm text-gray-500">{t('backoffice:settings.stripe.paypal.subtitle')}</p>
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
                {t('backoffice:settings.stripe.paypal.clientId')}
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
                {t('backoffice:settings.stripe.paypal.clientSecret')}
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
          {saving ? t('backoffice:settings.stripe.save.saving') : t('backoffice:settings.stripe.save.button')}
        </button>
      </div>
    </div>
  )
}
