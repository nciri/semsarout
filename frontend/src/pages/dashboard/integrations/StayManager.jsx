import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  FiExternalLink,
  FiChevronRight,
  FiZap
} from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

// StayManager.ma brand colors
const SM_COLORS = {
  primary: '#1e3a5f',      // Dark blue
  primaryLight: '#2d4a6f', // Lighter blue for hover
  secondary: '#f5a623',    // Orange/gold
  secondaryLight: '#f7b84d' // Lighter orange for hover
}

export default function StayManager() {
  const { token } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [integration, setIntegration] = useState(null)
  const [propertyLinks, setPropertyLinks] = useState([])
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showConnectForm, setShowConnectForm] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [email, setEmail] = useState('')

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
        setError('Cette fonctionnalite necessite le plan Pro ou superieur')
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
      setError('Erreur lors du chargement')
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
        body: JSON.stringify({
          api_key: apiKey,
          email: email
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur de connexion')
      }

      setIntegration(data.integration)
      setSuccess('Connexion StayManager reussie!')
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
    if (!confirm('Etes-vous sur de vouloir deconnecter StayManager? Toutes les donnees synchronisees seront conservees.')) {
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
        setSuccess('StayManager deconnecte')
      }
    } catch (err) {
      setError('Erreur lors de la deconnexion')
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
        setSuccess('Parametres mis a jour')
      }
    } catch (err) {
      setError('Erreur lors de la mise a jour')
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
        setSuccess(`Synchronisation terminee: ${data.items_created} crees, ${data.items_updated} mis a jour`)
        fetchPropertyLinks()
      } else {
        setError(data.error || 'Erreur de synchronisation')
      }
    } catch (err) {
      setError('Erreur lors de la synchronisation')
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
    if (error && !error.includes('plan Pro')) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    )
  }

  // Upgrade required
  if (error && error.includes('plan Pro')) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-br from-terracotta-50 to-orange-50 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-terracotta-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiZap className="w-8 h-8 text-terracotta-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Integration StayManager
          </h2>
          <p className="text-gray-600 mb-6">
            Synchronisez vos proprietes avec StayManager.ma pour gerer vos reservations,
            calendriers et verifications de clients en un seul endroit.
          </p>
          <p className="text-sm text-terracotta-700 mb-6">
            Cette fonctionnalite est disponible avec le plan Pro ou superieur.
          </p>
          <Link
            to="/dashboard/abonnement"
            className="inline-flex items-center gap-2 px-6 py-3 bg-terracotta-600 text-white rounded-lg hover:bg-terracotta-700 transition-colors"
          >
            Passer au plan Pro
            <FiChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: SM_COLORS.primary }}
          >
            <span className="text-white font-bold text-xl">SM</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">StayManager</h1>
            <p className="text-gray-600">Integration avec StayManager.ma</p>
          </div>
          <a
            href="https://staymanager.ma"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-2 text-sm hover:underline"
            style={{ color: SM_COLORS.primary }}
          >
            <FiExternalLink className="w-4 h-4" />
            staymanager.ma
          </a>
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <FiCheck className="w-5 h-5 text-green-600" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {error && !error.includes('plan Pro') && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <FiAlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Connection Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Statut de connexion</h2>
          {integration?.status === 'connected' ? (
            <span className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Connecte
            </span>
          ) : (
            <span className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
              Non connecte
            </span>
          )}
        </div>

        {integration?.status === 'connected' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Email</p>
                <p className="font-medium text-gray-900">{integration.staymanager_email || '-'}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Biens lies</p>
                <p className="font-medium text-gray-900">{integration.linked_properties_count || 0}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Derniere sync</p>
                <p className="font-medium text-gray-900">
                  {integration.last_sync_at
                    ? new Date(integration.last_sync_at).toLocaleString('fr-FR')
                    : 'Jamais'}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Auto-sync</p>
                <p className="font-medium text-gray-900">
                  {integration.auto_sync_enabled ? 'Active' : 'Desactive'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <FiX className="w-4 h-4" />
                Deconnecter
              </button>
            </div>
          </div>
        ) : (
          <div>
            {showConnectForm ? (
              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email StayManager
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cle API StayManager
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
                    Trouvez votre cle API dans les parametres de votre compte StayManager.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={connecting}
                    className="flex items-center gap-2 px-6 py-2.5 text-white rounded-lg disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: SM_COLORS.secondary }}
                    onMouseEnter={e => e.target.style.backgroundColor = SM_COLORS.secondaryLight}
                    onMouseLeave={e => e.target.style.backgroundColor = SM_COLORS.secondary}
                  >
                    {connecting ? (
                      <>
                        <FiRefreshCw className="w-4 h-4 animate-spin" />
                        Connexion...
                      </>
                    ) : (
                      <>
                        <FiLink className="w-4 h-4" />
                        Connecter
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConnectForm(false)}
                    className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-600 mb-6">
                  Connectez votre compte StayManager pour synchroniser vos proprietes et reservations.
                </p>
                <button
                  onClick={() => setShowConnectForm(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-lg transition-colors"
                  style={{ backgroundColor: SM_COLORS.secondary }}
                  onMouseEnter={e => e.target.style.backgroundColor = SM_COLORS.secondaryLight}
                  onMouseLeave={e => e.target.style.backgroundColor = SM_COLORS.secondary}
                >
                  <FiLink className="w-5 h-5" />
                  Connecter StayManager
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
            <FiSettings className="w-5 h-5 inline-block mr-2" />
            Parametres de synchronisation
          </h2>

          <div className="space-y-6">
            <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <div>
                <p className="font-medium text-gray-900">Synchronisation automatique</p>
                <p className="text-sm text-gray-500">Synchroniser les reservations periodiquement</p>
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
                  Frequence de synchronisation
                </label>
                <select
                  value={settings.sync_frequency_hours}
                  onChange={e => setSettings({ ...settings, sync_frequency_hours: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value={1}>Toutes les heures</option>
                  <option value={3}>Toutes les 3 heures</option>
                  <option value={6}>Toutes les 6 heures</option>
                  <option value={12}>Toutes les 12 heures</option>
                  <option value={24}>Une fois par jour</option>
                </select>
              </div>
            )}

            <button
              onClick={handleUpdateSettings}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <FiCheck className="w-4 h-4" />
              Sauvegarder les parametres
            </button>
          </div>
        </div>
      )}

      {/* Property Links Card - Only show when connected */}
      {integration?.status === 'connected' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              <FiHome className="w-5 h-5 inline-block mr-2" />
              Biens lies ({propertyLinks.length})
            </h2>
            <Link
              to="/dashboard/integrations/staymanager/properties"
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
              style={{ color: SM_COLORS.primary }}
            >
              Gerer les liens
              <FiChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {propertyLinks.length === 0 ? (
            <div className="text-center py-8">
              <FiHome className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">Aucun bien lie pour le moment</p>
              <Link
                to="/dashboard/integrations/staymanager/properties"
                className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors"
                style={{ backgroundColor: SM_COLORS.secondary }}
              >
                <FiLink className="w-4 h-4" />
                Lier un bien
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
                      <p className="font-medium text-gray-900">{link.property?.title || `Bien #${link.property_id}`}</p>
                      <p className="text-sm text-gray-500">
                        {link.staymanager_property_name}
                        {' '}&bull;{' '}
                        {link.reservations_count || 0} reservations
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
                      {link.sync_status === 'synced' ? 'Synchronise' :
                       link.sync_status === 'error' ? 'Erreur' : 'En attente'}
                    </span>
                    <button
                      onClick={() => handleSyncProperty(link.property_id)}
                      disabled={syncing}
                      className="p-2 text-gray-500 hover:bg-white rounded-lg transition-colors"
                      style={{ '--hover-color': SM_COLORS.secondary }}
                      title="Synchroniser"
                    >
                      <FiRefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} style={{ color: syncing ? SM_COLORS.secondary : undefined }} />
                    </button>
                  </div>
                </div>
              ))}

              {propertyLinks.length > 5 && (
                <Link
                  to="/dashboard/integrations/staymanager/properties"
                  className="block text-center py-3 font-medium hover:underline"
                  style={{ color: SM_COLORS.primary }}
                >
                  Voir tous les biens ({propertyLinks.length})
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
            <h3 className="font-semibold text-gray-900 mb-2">Calendrier synchronise</h3>
            <p className="text-sm text-gray-600">
              Synchronisez automatiquement vos calendriers entre SemsarOut et StayManager.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: `${SM_COLORS.secondary}20` }}
            >
              <FiUsers className="w-6 h-6" style={{ color: SM_COLORS.secondary }} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Verification des clients</h3>
            <p className="text-sm text-gray-600">
              Visualisez le statut de verification KYC de vos clients directement dans SemsarOut.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: `${SM_COLORS.primary}15` }}
            >
              <FiKey className="w-6 h-6" style={{ color: SM_COLORS.primary }} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Serrures connectees</h3>
            <p className="text-sm text-gray-600">
              Gerez les codes d'acces de vos serrures intelligentes depuis votre tableau de bord.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
