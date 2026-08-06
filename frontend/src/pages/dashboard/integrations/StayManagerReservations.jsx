import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiArrowLeft,
  FiCalendar,
  FiUser,
  FiCheck,
  FiX,
  FiAlertCircle,
  FiFilter,
  FiRefreshCw,
  FiShield,
  FiKey,
  FiFileText,
  FiMail,
  FiPhone
} from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'
import DirIcon from '../../../components/common/DirIcon'
import { useFormat } from '../../../utils/format'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

const STATUS_TONE = {
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  blocked: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700'
}

const PLATFORM_TONE = {
  airbnb: 'bg-pink-100 text-pink-700',
  booking: 'bg-blue-100 text-blue-700',
  vrbo: 'bg-indigo-100 text-indigo-700',
  direct: 'bg-purple-100 text-purple-700'
}

export default function StayManagerReservations() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { token } = useAuthStore()
  const { fmtDate, fmtDateTime, fmtNumber } = useFormat()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState([])
  const [propertyLinks, setPropertyLinks] = useState([])
  const [error, setError] = useState(null)

  // Filters
  const [propertyFilter, setPropertyFilter] = useState(searchParams.get('property_id') || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [upcomingOnly, setUpcomingOnly] = useState(true)

  // Selected reservation for detail view
  const [selectedReservation, setSelectedReservation] = useState(null)

  useEffect(() => {
    fetchPropertyLinks()
  }, [])

  useEffect(() => {
    fetchReservations()
  }, [propertyFilter, statusFilter, upcomingOnly])

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

  const fetchReservations = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (propertyFilter) params.set('property_id', propertyFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (upcomingOnly) params.set('upcoming', 'true')

      const response = await fetch(`${API_URL}/integrations/staymanager/reservations?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      setReservations(data.reservations || [])
    } catch (err) {
      setError(t('dashboard:stayManager.reservations.errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return fmtDate(dateStr, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '-'
    return fmtDate(dateStr, {
      day: 'numeric',
      month: 'short'
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/dashboard/staymanager"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <DirIcon icon={FiArrowLeft} className="w-4 h-4" />
          {t('dashboard:stayManager.reservations.back')}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('dashboard:stayManager.reservations.title')}</h1>
            <p className="text-gray-600 mt-1">{t('dashboard:stayManager.reservations.subtitle')}</p>
          </div>
          <button
            onClick={fetchReservations}
            className="flex items-center gap-2 px-4 py-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <FiRefreshCw className="w-4 h-4" />
            {t('dashboard:stayManager.reservations.refresh')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{t('dashboard:stayManager.reservations.filters.label')}</span>
          </div>

          <select
            value={propertyFilter}
            onChange={e => setPropertyFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">{t('dashboard:stayManager.reservations.filters.allProperties')}</option>
            {propertyLinks.map(link => (
              <option key={link.property_id} value={link.property_id}>
                {link.property?.title || t('dashboard:stayManager.properties.fallbackTitle', { id: link.property_id })}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">{t('dashboard:stayManager.reservations.filters.allStatuses')}</option>
            <option value="confirmed">{t('dashboard:stayManager.reservations.filters.status.confirmed')}</option>
            <option value="cancelled">{t('dashboard:stayManager.reservations.filters.status.cancelled')}</option>
            <option value="blocked">{t('dashboard:stayManager.reservations.filters.status.blocked')}</option>
            <option value="pending">{t('dashboard:stayManager.reservations.filters.status.pending')}</option>
          </select>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={upcomingOnly}
              onChange={e => setUpcomingOnly(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">{t('dashboard:stayManager.reservations.filters.upcomingOnly')}</span>
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <FiAlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Reservations List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent"></div>
          </div>
        ) : reservations.length === 0 ? (
          <div className="text-center py-12">
            <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('dashboard:stayManager.reservations.empty.title')}</h3>
            <p className="text-gray-600">
              {upcomingOnly
                ? t('dashboard:stayManager.reservations.empty.upcoming')
                : t('dashboard:stayManager.reservations.empty.filtered')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {reservations.map(reservation => {
              const statusTone = STATUS_TONE[reservation.status] || STATUS_TONE.pending
              const statusLabel = t(`dashboard:stayManager.reservations.status.${STATUS_TONE[reservation.status] ? reservation.status : 'pending'}`)
              const platformTone = PLATFORM_TONE[reservation.platform] || 'bg-gray-100 text-gray-700'
              const platformLabel = PLATFORM_TONE[reservation.platform]
                ? t(`dashboard:stayManager.reservations.platform.${reservation.platform}`)
                : (reservation.platform || t('dashboard:stayManager.reservations.platform.direct'))
              return (
                <div
                  key={reservation.id}
                  className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedReservation(reservation)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FiCalendar className="w-6 h-6 text-primary-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">
                            {reservation.guest?.name || t('dashboard:stayManager.reservations.card.guestFallback')}
                          </h3>
                          {reservation.guest?.verified && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              <FiShield className="w-3 h-3" />
                              {t('dashboard:stayManager.reservations.card.verified')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {formatDateShort(reservation.check_in)} - {formatDateShort(reservation.check_out)}
                          {reservation.nights && ` ${t('dashboard:stayManager.reservations.card.nights', { count: reservation.nights })}`}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusTone}`}>
                            {statusLabel}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${platformTone}`}>
                            {platformLabel}
                          </span>
                          {reservation.has_access_code && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                              <FiKey className="w-3 h-3" />
                              {t('dashboard:stayManager.reservations.card.accessCode')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-end">
                      {reservation.total_price && (
                        <p className="font-semibold text-gray-900">
                          {fmtNumber(parseFloat(reservation.total_price))} {reservation.currency || 'Đh'}
                        </p>
                      )}
                      {reservation.guest?.count && (
                        <p className="text-sm text-gray-500">
                          {t('dashboard:stayManager.reservations.card.guestCount', { count: reservation.guest.count })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Reservation Detail Modal */}
      {selectedReservation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">{t('dashboard:stayManager.reservations.detail.title')}</h3>
                <button
                  onClick={() => setSelectedReservation(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Guest Info */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">{t('dashboard:stayManager.reservations.detail.guest')}</h4>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <FiUser className="w-6 h-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedReservation.guest?.name || t('dashboard:stayManager.reservations.card.guestFallback')}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedReservation.guest?.verified ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <FiShield className="w-3 h-3" />
                          {t('dashboard:stayManager.reservations.detail.verified')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-yellow-600">
                          <FiAlertCircle className="w-3 h-3" />
                          {t('dashboard:stayManager.reservations.detail.notVerified')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {(selectedReservation.guest?.email || selectedReservation.guest?.phone) && (
                  <div className="mt-4 space-y-2">
                    {selectedReservation.guest?.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FiMail className="w-4 h-4 text-gray-400" />
                        {selectedReservation.guest.email}
                      </div>
                    )}
                    {selectedReservation.guest?.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FiPhone className="w-4 h-4 text-gray-400" />
                        {selectedReservation.guest.phone}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dates */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">{t('dashboard:stayManager.reservations.detail.dates')}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">{t('dashboard:stayManager.reservations.detail.checkin')}</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedReservation.check_in)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">{t('dashboard:stayManager.reservations.detail.checkout')}</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedReservation.check_out)}</p>
                  </div>
                </div>
                {selectedReservation.nights && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    {t('dashboard:stayManager.reservations.detail.nights', { count: selectedReservation.nights })}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">{t('dashboard:stayManager.reservations.detail.status')}</h4>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_TONE[selectedReservation.status] || 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_TONE[selectedReservation.status]
                      ? t(`dashboard:stayManager.reservations.status.${selectedReservation.status}`)
                      : selectedReservation.status}
                  </span>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${PLATFORM_TONE[selectedReservation.platform] || 'bg-gray-100 text-gray-700'}`}>
                    {PLATFORM_TONE[selectedReservation.platform]
                      ? t(`dashboard:stayManager.reservations.platform.${selectedReservation.platform}`)
                      : (selectedReservation.platform || t('dashboard:stayManager.reservations.platform.direct'))}
                  </span>
                </div>
              </div>

              {/* Price */}
              {selectedReservation.total_price && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">{t('dashboard:stayManager.reservations.detail.price')}</h4>
                  <p className="text-2xl font-bold text-gray-900">
                    {fmtNumber(parseFloat(selectedReservation.total_price))} {selectedReservation.currency || 'Đh'}
                  </p>
                </div>
              )}

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4">
                {selectedReservation.has_access_code && (
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-2 text-purple-700">
                      <FiKey className="w-4 h-4" />
                      <span className="text-sm font-medium">{t('dashboard:stayManager.reservations.detail.accessCode')}</span>
                    </div>
                    <p className="text-sm text-purple-600 mt-1">
                      {selectedReservation.access_code_masked
                        ? `****${selectedReservation.access_code_masked}`
                        : t('dashboard:stayManager.reservations.detail.accessCodeGenerated')}
                    </p>
                  </div>
                )}
                {selectedReservation.contract_status && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-700">
                      <FiFileText className="w-4 h-4" />
                      <span className="text-sm font-medium">{t('dashboard:stayManager.reservations.detail.contract')}</span>
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      {t(`dashboard:stayManager.reservations.detail.contractStatus.${
                        ['signed', 'sent', 'generated'].includes(selectedReservation.contract_status)
                          ? selectedReservation.contract_status
                          : 'none'
                      }`)}
                    </p>
                  </div>
                )}
              </div>

              {/* Notes */}
              {(selectedReservation.guest_notes || selectedReservation.special_requests) && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">{t('dashboard:stayManager.reservations.detail.notes')}</h4>
                  {selectedReservation.guest_notes && (
                    <p className="text-sm text-gray-600 mb-2">{selectedReservation.guest_notes}</p>
                  )}
                  {selectedReservation.special_requests && (
                    <p className="text-sm text-gray-600 italic">{selectedReservation.special_requests}</p>
                  )}
                </div>
              )}

              {/* Sync Info */}
              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-400">
                  {t('dashboard:stayManager.reservations.detail.idLabel', { id: selectedReservation.staymanager_reservation_id })}
                  {selectedReservation.external_id && t('dashboard:stayManager.reservations.detail.externalIdLabel', { id: selectedReservation.external_id })}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {t('dashboard:stayManager.reservations.detail.lastSync', {
                    date: selectedReservation.synced_at
                      ? fmtDateTime(selectedReservation.synced_at, { second: '2-digit' })
                      : t('dashboard:stayManager.reservations.detail.unknown')
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
