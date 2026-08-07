import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import {
  FiLink,
  FiRefreshCw,
  FiCheck,
  FiX,
  FiAlertCircle,
  FiSettings,
  FiHome,
  FiCalendar,
  FiUsers,
  FiClock,
  FiKey,
  FiChevronRight,
  FiZap
} from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'
import StayManagerWordmark from '../../../components/common/StayManagerWordmark'
import DirIcon from '../../../components/common/DirIcon'
import { useFormat } from '../../../utils/format'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

// Official StayManager.ma brand colors (same palette as /nos-services)
const SM_COLORS = {
  primary: '#2E5E4E',       // Green
  primaryLight: '#3A7561',  // Lighter green for hover
  primaryDark: '#1F3D34',   // Dark green (gradient end)
  secondary: '#C9A24B',     // Gold
  secondaryLight: '#D6B366', // Lighter gold for hover
  beige: '#F5F0E6'
}

export default function StayManager() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { accessToken: token } = useAuthStore()
  const { fmtDateTime } = useFormat()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [integration, setIntegration] = useState(null)
  const [propertyLinks, setPropertyLinks] = useState([])
  const [error, setError] = useState(null)
  const [upgradeRequired, setUpgradeRequired] = useState(false)
  const [success, setSuccess] = useState(null)
  const [showConnectForm, setShowConnectForm] = useState(false)
  const [apiKey, setApiKey] = useState('')

  // Settings form
  const [settings, setSettings] = useState({
    auto_sync_enabled: true,
    sync_frequency_hours: 6
  })

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/integrations/staymanager/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 403) {
        setError(t('dashboard:stayManager.overview.errors.upgradeRequired'))
        setUpgradeRequired(true)
        setLoading(false)
        return
      }

      const data = await response.json()
      setIntegration(data.integration)

      if (data.integration) {
        setSettings({
          auto_sync_enabled: data.integration.auto_sync_enabled,
          sync_frequency_hours: data.integration.sync_frequency_hours
        })
      }

      if (data.connected) {
        fetchPropertyLinks()
      }
    } catch (err) {
      setError(t('dashboard:stayManager.overview.errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const fetchPropertyLinks = async () => {
    try {
      const response = await fetch(`${API_URL}/integrations/staymanager/properties`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      setPropertyLinks(data.property_links || [])
    } catch (err) {
      console.error('Error fetching property links:', err)
    }
  }

  const handleConnect = async (e) => {
    e.preventDefault()
    setConnecting(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/integrations/staymanager/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ api_key: apiKey })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('dashboard:stayManager.overview.errors.connectFailed'))
      }

      setIntegration(data.integration)
      const connectSuccess = t('dashboard:stayManager.overview.messages.connectSuccess')
      setSuccess(data.warning ? `${connectSuccess} ${data.warning}` : connectSuccess)
      setShowConnectForm(false)
      setApiKey('')
      fetchPropertyLinks()
    } catch (err) {
      setError(err.message)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm(t('dashboard:stayManager.overview.confirmDisconnect'))) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/integrations/staymanager/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setIntegration(null)
        setPropertyLinks([])
        setSuccess(t('dashboard:stayManager.overview.messages.disconnectSuccess'))
      }
    } catch (err) {
      setError(t('dashboard:stayManager.overview.errors.disconnectFailed'))
    }
  }

  const handleUpdateSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/integrations/staymanager/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      })

      if (response.ok) {
        setSuccess(t('dashboard:stayManager.overview.messages.settingsUpdated'))
      }
    } catch (err) {
      setError(t('dashboard:stayManager.overview.errors.settingsUpdateFailed'))
    }
  }

  const handleSyncProperty = async (propertyId) => {
    setSyncing(true)
    try {
      const response = await fetch(`${API_URL}/integrations/staymanager/properties/${propertyId}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(t('dashboard:stayManager.overview.messages.syncComplete', {
          created: data.items_created,
          updated: data.items_updated
        }))
        fetchPropertyLinks()
      } else {
        setError(data.error || t('dashboard:stayManager.overview.errors.syncFailed'))
      }
    } catch (err) {
      setError(t('dashboard:stayManager.overview.errors.syncFailedGeneric'))
    } finally {
      setSyncing(false)
    }
  }

  // Auto-clear messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  useEffect(() => {
    if (error && !upgradeRequired) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error, upgradeRequired])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    )
  }

  // Upgrade required
  if (error && upgradeRequired) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-br from-terracotta-50 to-orange-50 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-terracotta-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiZap className="w-8 h-8 text-terracotta-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {t('dashboard:stayManager.overview.upgradeTitle')}
          </h2>
          <p className="text-gray-600 mb-6">
            {t('dashboard:stayManager.overview.upgradeDescription')}
          </p>
          <p className="text-sm text-terracotta-700 mb-6">
            {t('dashboard:stayManager.overview.upgradePlanNotice')}
          </p>
          <Link
            to="/dashboard/compte/abonnement"
            className="inline-flex items-center gap-2 px-6 py-3 bg-terracotta-600 text-white rounded-lg hover:bg-terracotta-700 transition-colors"
          >
            {t('dashboard:stayManager.overview.upgradeCta')}
            <DirIcon icon={FiChevronRight} className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mt-2 mb-8 p-6 rounded-2xl border" style={{
        background: `linear-gradient(to right, ${SM_COLORS.beige}, #FAF7F2, #ECF4EF)`,
        borderColor: '#E5DFD3'
      }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <a
            href="https://staymanager.ma"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img src="/staymanager-logo.png" alt="StayManager.ma" className="h-10" />
            <StayManagerWordmark className="text-2xl" />
          </a>
          <div className="sm:ms-2">
            <p className="text-sm" style={{ color: SM_COLORS.secondary }}>{t('dashboard:stayManager.overview.partnerLabel')}</p>
            <p className="text-gray-600 text-sm">
              {t('dashboard:stayManager.overview.partnerDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <FiCheck className="w-5 h-5 text-green-600" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {error && !upgradeRequired && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <FiAlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Connection Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:stayManager.overview.connectionStatusTitle')}</h2>
          {integration?.status === 'connected' ? (
            <span className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('dashboard:stayManager.overview.connected')}
            </span>
          ) : (
            <span className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
              {t('dashboard:stayManager.overview.disconnected')}
            </span>
          )}
        </div>

        {integration?.status === 'connected' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('dashboard:stayManager.overview.fieldEmail')}</p>
                <p className="font-medium text-gray-900">{integration.staymanager_email || '-'}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('dashboard:stayManager.overview.fieldLinkedProperties')}</p>
                <p className="font-medium text-gray-900">{integration.linked_properties_count || 0}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('dashboard:stayManager.overview.fieldLastSync')}</p>
                <p className="font-medium text-gray-900">
                  {integration.last_sync_at
                    ? fmtDateTime(integration.last_sync_at, { second: '2-digit' })
                    : t('dashboard:stayManager.overview.never')}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('dashboard:stayManager.overview.fieldAutoSync')}</p>
                <p className="font-medium text-gray-900">
                  {integration.auto_sync_enabled
                    ? t('dashboard:stayManager.overview.autoSyncEnabled')
                    : t('dashboard:stayManager.overview.autoSyncDisabled')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <FiX className="w-4 h-4" />
                {t('dashboard:stayManager.overview.disconnect')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {showConnectForm ? (
              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('dashboard:stayManager.overview.apiKeyLabel')}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk_live_..."
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    <Trans
                      i18nKey="dashboard:stayManager.overview.apiKeyHelp"
                      components={{
                        mono1: <span className="font-mono text-xs" />,
                        mono2: <span className="font-mono text-xs" />,
                        mono3: <span className="font-mono text-xs" />,
                        mono4: <span className="font-mono text-xs" />
                      }}
                    />
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={connecting}
                    className="flex items-center gap-2 px-6 py-2.5 text-white rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90 bg-gradient-to-r from-[#1F3D34] via-[#2E5E4E] to-[#2E5E4E]"
                  >
                    {connecting ? (
                      <>
                        <FiRefreshCw className="w-4 h-4 animate-spin" />
                        {t('dashboard:stayManager.overview.connecting')}
                      </>
                    ) : (
                      <>
                        <FiLink className="w-4 h-4" />
                        {t('dashboard:stayManager.overview.connect')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConnectForm(false)}
                    className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {t('dashboard:shared.actions.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-600 mb-6 flex items-center justify-center gap-1.5 flex-wrap">
                  <Trans
                    i18nKey="dashboard:stayManager.overview.connectPrompt"
                    components={{
                      wordmark: (
                        <span className="inline-flex items-center gap-1">
                          <img src="/staymanager-logo.png" alt="" className="h-4" />
                          <StayManagerWordmark className="text-base" />
                        </span>
                      )
                    }}
                  />
                </p>
                <button
                  onClick={() => setShowConnectForm(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-lg transition-opacity hover:opacity-90 bg-gradient-to-r from-[#1F3D34] via-[#2E5E4E] to-[#2E5E4E]"
                >
                  <FiLink className="w-5 h-5" />
                  {t('dashboard:stayManager.overview.connectCta')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Card - Only show when connected */}
      {integration?.status === 'connected' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            <FiSettings className="w-5 h-5 inline-block me-2" />
            {t('dashboard:stayManager.overview.settingsTitle')}
          </h2>

          <div className="space-y-6">
            <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <div>
                <p className="font-medium text-gray-900">{t('dashboard:stayManager.overview.autoSyncTitle')}</p>
                <p className="text-sm text-gray-500">{t('dashboard:stayManager.overview.autoSyncDescription')}</p>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={settings.auto_sync_enabled}
                  onChange={e => setSettings({ ...settings, auto_sync_enabled: e.target.checked })}
                  className="sr-only"
                />
                <div
                  className="w-11 h-6 rounded-full transition-colors"
                  style={{ backgroundColor: settings.auto_sync_enabled ? SM_COLORS.secondary : '#d1d5db' }}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${settings.auto_sync_enabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`}></div>
                </div>
              </div>
            </label>

            {settings.auto_sync_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('dashboard:stayManager.overview.frequencyLabel')}
                </label>
                <select
                  value={settings.sync_frequency_hours}
                  onChange={e => setSettings({ ...settings, sync_frequency_hours: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value={1}>{t('dashboard:stayManager.overview.frequencyHourly')}</option>
                  <option value={3}>{t('dashboard:stayManager.overview.frequencyEvery3h')}</option>
                  <option value={6}>{t('dashboard:stayManager.overview.frequencyEvery6h')}</option>
                  <option value={12}>{t('dashboard:stayManager.overview.frequencyEvery12h')}</option>
                  <option value={24}>{t('dashboard:stayManager.overview.frequencyDaily')}</option>
                </select>
              </div>
            )}

            <button
              onClick={handleUpdateSettings}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <FiCheck className="w-4 h-4" />
              {t('dashboard:stayManager.overview.saveSettings')}
            </button>
          </div>
        </div>
      )}

      {/* Property Links Card - Only show when connected */}
      {integration?.status === 'connected' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              <FiHome className="w-5 h-5 inline-block me-2" />
              {t('dashboard:stayManager.overview.propertyLinksTitle', { count: propertyLinks.length })}
            </h2>
            <Link
              to="/dashboard/staymanager/biens"
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
              style={{ color: SM_COLORS.primary }}
            >
              {t('dashboard:stayManager.overview.manageLinks')}
              <DirIcon icon={FiChevronRight} className="w-4 h-4" />
            </Link>
          </div>

          {propertyLinks.length === 0 ? (
            <div className="text-center py-8">
              <FiHome className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">{t('dashboard:stayManager.overview.propertyLinksEmpty')}</p>
              <Link
                to="/dashboard/staymanager/biens"
                className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-opacity hover:opacity-90 bg-gradient-to-r from-[#1F3D34] via-[#2E5E4E] to-[#2E5E4E]"
              >
                <FiLink className="w-4 h-4" />
                {t('dashboard:stayManager.overview.linkProperty')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {propertyLinks.slice(0, 5).map(link => (
                <div key={link.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${SM_COLORS.primary}20` }}
                    >
                      <FiHome className="w-5 h-5" style={{ color: SM_COLORS.primary }} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {link.property?.title || t('dashboard:stayManager.overview.propertyFallbackTitle', { id: link.property_id })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {link.staymanager_property_name}
                        {' '}&bull;{' '}
                        {t('dashboard:stayManager.overview.reservationsCount', { count: link.reservations_count || 0 })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      link.sync_status === 'synced'
                        ? 'bg-green-100 text-green-700'
                        : link.sync_status === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {t(`dashboard:stayManager.overview.syncStatus.${link.sync_status === 'synced' ? 'synced' : link.sync_status === 'error' ? 'error' : 'pending'}`)}
                    </span>
                    <button
                      onClick={() => handleSyncProperty(link.property_id)}
                      disabled={syncing}
                      className="p-2 text-gray-500 hover:bg-white rounded-lg transition-colors"
                      style={{ '--hover-color': SM_COLORS.secondary }}
                      title={t('dashboard:stayManager.overview.syncTooltip')}
                    >
                      <FiRefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} style={{ color: syncing ? SM_COLORS.secondary : undefined }} />
                    </button>
                  </div>
                </div>
              ))}

              {propertyLinks.length > 5 && (
                <Link
                  to="/dashboard/staymanager/biens"
                  className="block text-center py-3 font-medium hover:underline"
                  style={{ color: SM_COLORS.primary }}
                >
                  {t('dashboard:stayManager.overview.viewAllProperties', { count: propertyLinks.length })}
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Features Info - Show when not connected */}
      {integration?.status !== 'connected' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: `${SM_COLORS.primary}15` }}
            >
              <FiCalendar className="w-6 h-6" style={{ color: SM_COLORS.primary }} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('dashboard:stayManager.overview.features.calendarTitle')}</h3>
            <p className="text-sm text-gray-600">
              {t('dashboard:stayManager.overview.features.calendarDescription')}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: `${SM_COLORS.secondary}20` }}
            >
              <FiUsers className="w-6 h-6" style={{ color: SM_COLORS.secondary }} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('dashboard:stayManager.overview.features.verificationTitle')}</h3>
            <p className="text-sm text-gray-600">
              {t('dashboard:stayManager.overview.features.verificationDescription')}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: `${SM_COLORS.primary}15` }}
            >
              <FiKey className="w-6 h-6" style={{ color: SM_COLORS.primary }} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{t('dashboard:stayManager.overview.features.locksTitle')}</h3>
            <p className="text-sm text-gray-600">
              {t('dashboard:stayManager.overview.features.locksDescription')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
