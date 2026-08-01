import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

const STATUS_LABELS = {
  confirmed: { label: 'Confirmee', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulee', color: 'bg-red-100 text-red-700' },
  blocked: { label: 'Bloquee', color: 'bg-gray-100 text-gray-700' },
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' }
}

const PLATFORM_LABELS = {
  airbnb: { label: 'Airbnb', color: 'bg-pink-100 text-pink-700' },
  booking: { label: 'Booking.com', color: 'bg-blue-100 text-blue-700' },
  vrbo: { label: 'VRBO', color: 'bg-indigo-100 text-indigo-700' },
  direct: { label: 'Direct', color: 'bg-purple-100 text-purple-700' }
}

export default function StayManagerReservations() {
  const { token } = useAuthStore()
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
      setError('Erreur lors du chargement des reservations')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('fr-FR', {
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
          <FiArrowLeft className="w-4 h-4" />
          Retour aux parametres
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reservations StayManager</h1>
            <p className="text-gray-600 mt-1">Toutes les reservations synchronisees depuis StayManager</p>
          </div>
          <button
            onClick={fetchReservations}
            className="flex items-center gap-2 px-4 py-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <FiRefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filtres:</span>
          </div>

          <select
            value={propertyFilter}
            onChange={e => setPropertyFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Tous les biens</option>
            {propertyLinks.map(link => (
              <option key={link.property_id} value={link.property_id}>
                {link.property?.title || `Bien #${link.property_id}`}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Tous les statuts</option>
            <option value="confirmed">Confirmees</option>
            <option value="cancelled">Annulees</option>
            <option value="blocked">Bloquees</option>
            <option value="pending">En attente</option>
          </select>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={upcomingOnly}
              onChange={e => setUpcomingOnly(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">A venir uniquement</span>
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune reservation</h3>
            <p className="text-gray-600">
              {upcomingOnly
                ? 'Aucune reservation a venir.'
                : 'Aucune reservation trouvee avec ces filtres.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {reservations.map(reservation => {
              const status = STATUS_LABELS[reservation.status] || STATUS_LABELS.pending
              const platform = PLATFORM_LABELS[reservation.platform] || { label: reservation.platform || 'Direct', color: 'bg-gray-100 text-gray-700' }

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
                            {reservation.guest?.name || 'Client'}
                          </h3>
                          {reservation.guest?.verified && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              <FiShield className="w-3 h-3" />
                              Verifie
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {formatDateShort(reservation.check_in)} - {formatDateShort(reservation.check_out)}
                          {reservation.nights && ` (${reservation.nights} nuits)`}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${platform.color}`}>
                            {platform.label}
                          </span>
                          {reservation.has_access_code && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                              <FiKey className="w-3 h-3" />
                              Code
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {reservation.total_price && (
                        <p className="font-semibold text-gray-900">
                          {parseFloat(reservation.total_price).toLocaleString('fr-FR')} {reservation.currency || 'Đh'}
                        </p>
                      )}
                      {reservation.guest?.count && (
                        <p className="text-sm text-gray-500">
                          {reservation.guest.count} voyageur{reservation.guest.count > 1 ? 's' : ''}
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
                <h3 className="text-lg font-semibold text-gray-900">Details de la reservation</h3>
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
                <h4 className="text-sm font-medium text-gray-500 mb-3">Client</h4>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <FiUser className="w-6 h-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedReservation.guest?.name || 'Client'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedReservation.guest?.verified ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <FiShield className="w-3 h-3" />
                          Verifie
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-yellow-600">
                          <FiAlertCircle className="w-3 h-3" />
                          Non verifie
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
                <h4 className="text-sm font-medium text-gray-500 mb-3">Dates</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Arrivee</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedReservation.check_in)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Depart</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedReservation.check_out)}</p>
                  </div>
                </div>
                {selectedReservation.nights && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    {selectedReservation.nights} nuit{selectedReservation.nights > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">Statut</h4>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_LABELS[selectedReservation.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABELS[selectedReservation.status]?.label || selectedReservation.status}
                  </span>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${PLATFORM_LABELS[selectedReservation.platform]?.color || 'bg-gray-100 text-gray-700'}`}>
                    {PLATFORM_LABELS[selectedReservation.platform]?.label || selectedReservation.platform || 'Direct'}
                  </span>
                </div>
              </div>

              {/* Price */}
              {selectedReservation.total_price && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">Prix total</h4>
                  <p className="text-2xl font-bold text-gray-900">
                    {parseFloat(selectedReservation.total_price).toLocaleString('fr-FR')} {selectedReservation.currency || 'Đh'}
                  </p>
                </div>
              )}

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4">
                {selectedReservation.has_access_code && (
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-2 text-purple-700">
                      <FiKey className="w-4 h-4" />
                      <span className="text-sm font-medium">Code d'acces</span>
                    </div>
                    <p className="text-sm text-purple-600 mt-1">
                      {selectedReservation.access_code_masked ? `****${selectedReservation.access_code_masked}` : 'Genere'}
                    </p>
                  </div>
                )}
                {selectedReservation.contract_status && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-700">
                      <FiFileText className="w-4 h-4" />
                      <span className="text-sm font-medium">Contrat</span>
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      {selectedReservation.contract_status === 'signed' ? 'Signe' :
                       selectedReservation.contract_status === 'sent' ? 'Envoye' :
                       selectedReservation.contract_status === 'generated' ? 'Genere' : 'Non genere'}
                    </p>
                  </div>
                )}
              </div>

              {/* Notes */}
              {(selectedReservation.guest_notes || selectedReservation.special_requests) && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">Notes</h4>
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
                  ID: {selectedReservation.staymanager_reservation_id}
                  {selectedReservation.external_id && ` | Externe: ${selectedReservation.external_id}`}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Derniere sync: {selectedReservation.synced_at ? new Date(selectedReservation.synced_at).toLocaleString('fr-FR') : 'Inconnue'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
