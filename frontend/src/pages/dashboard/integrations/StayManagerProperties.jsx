import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import {
  FiArrowLeft,
  FiLink,
  FiRefreshCw,
  FiCheck,
  FiX,
  FiAlertCircle,
  FiHome,
  FiCalendar,
  FiSearch,
  FiChevronDown
} from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'
import DirIcon from '../../../components/common/DirIcon'
import { useFormat } from '../../../utils/format'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

export default function StayManagerProperties() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { accessToken: token } = useAuthStore()
  const { fmtDate } = useFormat()
  const [loading, setLoading] = useState(true)
  const [propertyLinks, setPropertyLinks] = useState([])
  const [availableProperties, setAvailableProperties] = useState([])
  const [myProperties, setMyProperties] = useState([])
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [syncing, setSyncing] = useState(null)
  const [linking, setLinking] = useState(false)

  // Link form state
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [selectedSemsarProperty, setSelectedSemsarProperty] = useState('')
  const [selectedStayManagerProperty, setSelectedStayManagerProperty] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch linked properties
      const linksResponse = await fetch(`${API_URL}/integrations/staymanager/properties`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const linksData = await linksResponse.json()
      setPropertyLinks(linksData.property_links || [])

      // Fetch available StayManager properties
      const availableResponse = await fetch(`${API_URL}/integrations/staymanager/properties/available`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const availableData = await availableResponse.json()
      setAvailableProperties(availableData.staymanager_properties || [])

      // Fetch user's SemsarOut properties (rental properties only)
      const propertiesResponse = await fetch(`${API_URL}/properties/my?transaction_type=rent`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const propertiesData = await propertiesResponse.json()
      setMyProperties(propertiesData.properties || [])

    } catch (err) {
      setError(t('dashboard:stayManager.properties.errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleLink = async (e) => {
    e.preventDefault()
    if (!selectedSemsarProperty || !selectedStayManagerProperty) {
      setError(t('dashboard:stayManager.properties.errors.selectBoth'))
      return
    }

    setLinking(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/integrations/staymanager/properties/${selectedSemsarProperty}/link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          staymanager_property_id: selectedStayManagerProperty
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('dashboard:stayManager.properties.errors.linkFailed'))
      }

      setSuccess(t('dashboard:stayManager.properties.messages.linked'))
      setShowLinkForm(false)
      setSelectedSemsarProperty('')
      setSelectedStayManagerProperty('')
      fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async (propertyId) => {
    if (!confirm(t('dashboard:stayManager.properties.confirmUnlink'))) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/integrations/staymanager/properties/${propertyId}/unlink`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setSuccess(t('dashboard:stayManager.properties.messages.unlinked'))
        fetchData()
      }
    } catch (err) {
      setError(t('dashboard:stayManager.properties.errors.unlinkFailed'))
    }
  }

  const handleSync = async (propertyId) => {
    setSyncing(propertyId)
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
        setSuccess(t('dashboard:stayManager.properties.messages.syncComplete', {
          created: data.items_created,
          updated: data.items_updated
        }))
        fetchData()
      } else {
        setError(data.error || t('dashboard:stayManager.properties.errors.syncFailed'))
      }
    } catch (err) {
      setError(t('dashboard:stayManager.properties.errors.syncFailedGeneric'))
    } finally {
      setSyncing(null)
    }
  }

  // Get unlinked SemsarOut properties
  const linkedPropertyIds = new Set(propertyLinks.map(l => l.property_id))
  const unlinkableProperties = myProperties.filter(p => !linkedPropertyIds.has(p.id))

  // Auto-clear messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  useEffect(() => {
    if (error) {
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

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/dashboard/staymanager"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <DirIcon icon={FiArrowLeft} className="w-4 h-4" />
          {t('dashboard:stayManager.properties.back')}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('dashboard:stayManager.properties.title')}</h1>
            <p className="text-gray-600 mt-1">{t('dashboard:stayManager.properties.subtitle')}</p>
          </div>
          <button
            onClick={() => setShowLinkForm(true)}
            disabled={unlinkableProperties.length === 0 || availableProperties.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiLink className="w-4 h-4" />
            {t('dashboard:stayManager.properties.linkProperty')}
          </button>
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <FiCheck className="w-5 h-5 text-green-600" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <FiAlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Link Form Modal */}
      {showLinkForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard:stayManager.properties.modal.title')}</h3>

            <form onSubmit={handleLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('dashboard:stayManager.properties.modal.semsarLabel')}
                </label>
                <select
                  value={selectedSemsarProperty}
                  onChange={e => setSelectedSemsarProperty(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                >
                  <option value="">{t('dashboard:stayManager.properties.modal.semsarPlaceholder')}</option>
                  {unlinkableProperties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} - {p.city}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('dashboard:stayManager.properties.modal.stayManagerLabel')}
                </label>
                <select
                  value={selectedStayManagerProperty}
                  onChange={e => setSelectedStayManagerProperty(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                >
                  <option value="">{t('dashboard:stayManager.properties.modal.stayManagerPlaceholder')}</option>
                  {availableProperties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={linking}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {linking ? (
                    <>
                      <FiRefreshCw className="w-4 h-4 animate-spin" />
                      {t('dashboard:stayManager.properties.modal.linking')}
                    </>
                  ) : (
                    <>
                      <FiLink className="w-4 h-4" />
                      {t('dashboard:stayManager.properties.modal.link')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkForm(false)
                    setSelectedSemsarProperty('')
                    setSelectedStayManagerProperty('')
                  }}
                  className="px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {t('dashboard:shared.actions.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Linked Properties List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {propertyLinks.length === 0 ? (
          <div className="text-center py-12">
            <FiLink className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('dashboard:stayManager.properties.empty.title')}</h3>
            <p className="text-gray-600 mb-6">
              {t('dashboard:stayManager.properties.empty.description')}
            </p>
            {unlinkableProperties.length > 0 && availableProperties.length > 0 && (
              <button
                onClick={() => setShowLinkForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <FiLink className="w-4 h-4" />
                {t('dashboard:stayManager.properties.linkProperty')}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {propertyLinks.map(link => (
              <div key={link.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                      <FiHome className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {link.property?.title || t('dashboard:stayManager.properties.fallbackTitle', { id: link.property_id })}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {t('dashboard:stayManager.properties.linkedTo')} <span className="font-medium">{link.staymanager_property_name}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      link.sync_status === 'synced'
                        ? 'bg-green-100 text-green-700'
                        : link.sync_status === 'syncing'
                        ? 'bg-blue-100 text-blue-700'
                        : link.sync_status === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {t(`dashboard:stayManager.properties.status.${['synced', 'syncing', 'error'].includes(link.sync_status) ? link.sync_status : 'pending'}`)}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">{t('dashboard:stayManager.properties.stats.reservations')}</p>
                    <p className="font-semibold text-gray-900">{link.reservations_count || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">{t('dashboard:stayManager.properties.stats.lastSync')}</p>
                    <p className="font-semibold text-gray-900 text-sm">
                      {link.last_reservation_sync
                        ? fmtDate(link.last_reservation_sync)
                        : t('dashboard:stayManager.properties.never')}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">{t('dashboard:stayManager.properties.stats.ical')}</p>
                    <p className="font-semibold text-gray-900 text-sm">
                      {link.ical_url
                        ? t('dashboard:stayManager.properties.stats.icalAvailable')
                        : t('dashboard:stayManager.properties.stats.icalUnavailable')}
                    </p>
                  </div>
                </div>

                {/* Sync error */}
                {link.sync_error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{link.sync_error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSync(link.property_id)}
                    disabled={syncing === link.property_id}
                    className="flex items-center gap-2 px-4 py-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <FiRefreshCw className={`w-4 h-4 ${syncing === link.property_id ? 'animate-spin' : ''}`} />
                    {t('dashboard:stayManager.properties.actions.sync')}
                  </button>
                  <Link
                    to={`/dashboard/staymanager/reservations?property_id=${link.property_id}`}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <FiCalendar className="w-4 h-4" />
                    {t('dashboard:stayManager.properties.actions.viewReservations')}
                  </Link>
                  <button
                    onClick={() => handleUnlink(link.property_id)}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors ms-auto"
                  >
                    <FiX className="w-4 h-4" />
                    {t('dashboard:stayManager.properties.actions.unlink')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      {unlinkableProperties.length === 0 && propertyLinks.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <Trans
              i18nKey="dashboard:stayManager.properties.info.allLinked"
              components={{ strong: <strong /> }}
            />
          </p>
        </div>
      )}

      {availableProperties.length === 0 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <Trans
              i18nKey="dashboard:stayManager.properties.info.noneAvailable"
              components={{ strong: <strong /> }}
            />
          </p>
        </div>
      )}
    </div>
  )
}
