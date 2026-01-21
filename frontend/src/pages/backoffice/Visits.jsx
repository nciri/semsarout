import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  FiPlus, FiCalendar, FiClock, FiUser, FiHome, FiPhone, FiMail,
  FiCheck, FiX, FiMoreVertical, FiChevronLeft, FiChevronRight,
  FiFilter, FiList, FiGrid
} from 'react-icons/fi'

const backofficeService = {
  getVisits: async (params) => {
    const searchParams = new URLSearchParams(params)
    const response = await fetch(`/api/v1/backoffice/visits?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to fetch visits')
    return response.json()
  },
  getCalendarVisits: async (params) => {
    const searchParams = new URLSearchParams(params)
    const response = await fetch(`/api/v1/backoffice/visits/calendar?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to fetch calendar')
    return response.json()
  },
  createVisit: async (data) => {
    const response = await fetch('/api/v1/backoffice/visits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to create visit')
    return response.json()
  },
  confirmVisit: async (id) => {
    const response = await fetch(`/api/v1/backoffice/visits/${id}/confirm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to confirm visit')
    return response.json()
  },
  completeVisit: async ({ id, data }) => {
    const response = await fetch(`/api/v1/backoffice/visits/${id}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Failed to complete visit')
    return response.json()
  },
  cancelVisit: async (id) => {
    const response = await fetch(`/api/v1/backoffice/visits/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to cancel visit')
    return response.json()
  }
}

const STATUS_COLORS = {
  scheduled: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  no_show: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' }
}

const STATUS_LABELS = {
  scheduled: 'Planifié',
  confirmed: 'Confirmé',
  completed: 'Effectuée',
  cancelled: 'Annulée',
  no_show: 'No-show'
}

function VisitModal({ visit, onClose, onConfirm, onComplete, onCancel }) {
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  const [report, setReport] = useState('')
  const [feedback, setFeedback] = useState('')

  const handleComplete = () => {
    onComplete(visit.id, { report, client_feedback: feedback })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Détails de la visite</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[visit.status]?.bg} ${STATUS_COLORS[visit.status]?.text}`}>
              {STATUS_LABELS[visit.status]}
            </span>
          </div>

          {/* Property */}
          <div className="flex items-start gap-3">
            <FiHome className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">{visit.property_title || 'Bien non défini'}</p>
              <p className="text-sm text-gray-500">{visit.property_city}</p>
            </div>
          </div>

          {/* Date & Time */}
          <div className="flex items-center gap-3">
            <FiCalendar className="w-5 h-5 text-gray-400" />
            <div>
              <p className="font-medium text-gray-900">
                {new Date(visit.scheduled_at).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
              <p className="text-sm text-gray-500">
                {new Date(visit.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                {visit.duration_minutes && ` - ${visit.duration_minutes} min`}
              </p>
            </div>
          </div>

          {/* Visitor */}
          <div className="flex items-start gap-3">
            <FiUser className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">{visit.visitor_name || visit.contact_name || 'Visiteur non défini'}</p>
              {visit.visitor_email && (
                <a href={`mailto:${visit.visitor_email}`} className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                  <FiMail className="w-3 h-3" /> {visit.visitor_email}
                </a>
              )}
              {visit.visitor_phone && (
                <a href={`tel:${visit.visitor_phone}`} className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                  <FiPhone className="w-3 h-3" /> {visit.visitor_phone}
                </a>
              )}
            </div>
          </div>

          {/* Notes */}
          {visit.notes && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">{visit.notes}</p>
            </div>
          )}

          {/* Complete form */}
          {showCompleteForm && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rapport de visite</label>
                <textarea
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Commentaires sur la visite..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Feedback client</label>
                <select
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Sélectionner...</option>
                  <option value="very_interested">Très intéressé</option>
                  <option value="interested">Intéressé</option>
                  <option value="neutral">Neutre</option>
                  <option value="not_interested">Pas intéressé</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          {visit.status === 'scheduled' && (
            <>
              <button
                onClick={() => onConfirm(visit.id)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirmer
              </button>
              <button
                onClick={() => onCancel(visit.id)}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
            </>
          )}
          {visit.status === 'confirmed' && (
            <>
              {showCompleteForm ? (
                <button
                  onClick={handleComplete}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Valider le rapport
                </button>
              ) : (
                <button
                  onClick={() => setShowCompleteForm(true)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Marquer effectuée
                </button>
              )}
              <button
                onClick={() => onCancel(visit.id)}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
            </>
          )}
          {(visit.status === 'completed' || visit.status === 'cancelled' || visit.status === 'no_show') && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function NewVisitModal({ onClose, onCreate }) {
  const [formData, setFormData] = useState({
    property_id: '',
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    scheduled_at: '',
    duration_minutes: 30,
    notes: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onCreate(formData)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Planifier une visite</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du visiteur *</label>
            <input
              type="text"
              required
              value={formData.visitor_name}
              onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.visitor_email}
                onChange={(e) => setFormData({ ...formData, visitor_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel"
                value={formData.visitor_phone}
                onChange={(e) => setFormData({ ...formData, visitor_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date et heure *</label>
              <input
                type="datetime-local"
                required
                value={formData.scheduled_at}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (minutes)</label>
              <select
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 heure</option>
                <option value={90}>1h30</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Informations supplémentaires..."
            />
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Planifier
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CalendarDay({ date, visits, isCurrentMonth, isToday, onVisitClick }) {
  return (
    <div className={`min-h-[100px] border-r border-b border-gray-100 p-1 ${
      !isCurrentMonth ? 'bg-gray-50' : ''
    } ${isToday ? 'bg-primary-50' : ''}`}>
      <div className={`text-sm font-medium mb-1 ${
        !isCurrentMonth ? 'text-gray-400' : isToday ? 'text-primary-600' : 'text-gray-900'
      }`}>
        {date.getDate()}
      </div>
      <div className="space-y-1">
        {visits.slice(0, 3).map(visit => (
          <button
            key={visit.id}
            onClick={() => onVisitClick(visit)}
            className={`w-full text-left px-1.5 py-0.5 rounded text-xs truncate ${STATUS_COLORS[visit.status]?.bg} ${STATUS_COLORS[visit.status]?.text}`}
          >
            {new Date(visit.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            {' '}{visit.visitor_name || visit.contact_name}
          </button>
        ))}
        {visits.length > 3 && (
          <div className="text-xs text-gray-500 px-1">+{visits.length - 3} autres</div>
        )}
      </div>
    </div>
  )
}

export default function BackofficeVisits() {
  const queryClient = useQueryClient()
  const [view, setView] = useState('calendar')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedVisit, setSelectedVisit] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [filters, setFilters] = useState({ status: '', page: 1 })

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

  const { data: calendarData, isLoading: loadingCalendar } = useQuery(
    ['backoffice-calendar', currentDate.getMonth(), currentDate.getFullYear()],
    () => backofficeService.getCalendarVisits({
      start: startOfMonth.toISOString(),
      end: endOfMonth.toISOString()
    }),
    { enabled: view === 'calendar' }
  )

  const { data: listData, isLoading: loadingList } = useQuery(
    ['backoffice-visits', filters],
    () => backofficeService.getVisits(filters),
    { enabled: view === 'list' }
  )

  const createMutation = useMutation(backofficeService.createVisit, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-calendar')
      queryClient.invalidateQueries('backoffice-visits')
    }
  })

  const confirmMutation = useMutation(backofficeService.confirmVisit, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-calendar')
      queryClient.invalidateQueries('backoffice-visits')
      setSelectedVisit(null)
    }
  })

  const completeMutation = useMutation(({ id, data }) => backofficeService.completeVisit({ id, data }), {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-calendar')
      queryClient.invalidateQueries('backoffice-visits')
      setSelectedVisit(null)
    }
  })

  const cancelMutation = useMutation(backofficeService.cancelVisit, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-calendar')
      queryClient.invalidateQueries('backoffice-visits')
      setSelectedVisit(null)
    }
  })

  // Generate calendar days
  const generateCalendarDays = () => {
    const days = []
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    // Get the first day of the week (Monday = 1)
    let startDay = firstDay.getDay()
    if (startDay === 0) startDay = 7
    startDay -= 1

    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(firstDay)
      date.setDate(date.getDate() - i - 1)
      days.push({ date, isCurrentMonth: false })
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({
        date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i),
        isCurrentMonth: true
      })
    }

    // Next month days
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(lastDay)
      date.setDate(date.getDate() + i)
      days.push({ date, isCurrentMonth: false })
    }

    return days
  }

  const getVisitsForDate = (date) => {
    if (!calendarData?.items) return []
    return calendarData.items.filter(item => {
      if (item.type !== 'visit') return false
      const visitDate = new Date(item.start)
      return visitDate.toDateString() === date.toDateString()
    }).map(item => item.data)
  }

  const isToday = (date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const navigateMonth = (direction) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visites & RDV</h1>
          <p className="text-gray-500">Gérez vos visites et rendez-vous</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <FiPlus className="w-5 h-5" />
          Planifier une visite
        </button>
      </div>

      {/* View toggle and navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setView('calendar')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                view === 'calendar'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FiGrid className="w-4 h-4" />
              Calendrier
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                view === 'list'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FiList className="w-4 h-4" />
              Liste
            </button>
          </div>

          {/* Month navigation */}
          {view === 'calendar' && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-lg font-semibold text-gray-900 min-w-[180px] text-center">
                {currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => navigateMonth(1)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <FiChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg"
              >
                Aujourd'hui
              </button>
            </div>
          )}

          {/* List filters */}
          {view === 'list' && (
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Calendar view */}
      {view === 'calendar' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Days header */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-500 bg-gray-50">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loadingCalendar ? (
            <div className="h-96 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {generateCalendarDays().map((day, i) => (
                <CalendarDay
                  key={i}
                  date={day.date}
                  visits={getVisitsForDate(day.date)}
                  isCurrentMonth={day.isCurrentMonth}
                  isToday={isToday(day.date)}
                  onVisitClick={setSelectedVisit}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {loadingList ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : listData?.visits?.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {listData.visits.map(visit => (
                <div
                  key={visit.id}
                  onClick={() => setSelectedVisit(visit)}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[60px]">
                        <p className="text-2xl font-bold text-gray-900">
                          {new Date(visit.scheduled_at).getDate()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(visit.scheduled_at).toLocaleDateString('fr-FR', { month: 'short' })}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{visit.visitor_name || visit.contact_name}</p>
                        <p className="text-sm text-gray-500">
                          <FiClock className="inline w-3 h-3 mr-1" />
                          {new Date(visit.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {visit.property_title && ` - ${visit.property_title}`}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[visit.status]?.bg} ${STATUS_COLORS[visit.status]?.text}`}>
                      {STATUS_LABELS[visit.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune visite</h3>
              <p className="text-gray-500 mb-4">Planifiez votre première visite.</p>
              <button
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <FiPlus className="w-5 h-5" />
                Planifier une visite
              </button>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Légende des statuts</h3>
        <div className="flex flex-wrap gap-4">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[key]?.dot}`}></span>
              <span className="text-sm text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {selectedVisit && (
        <VisitModal
          visit={selectedVisit}
          onClose={() => setSelectedVisit(null)}
          onConfirm={(id) => confirmMutation.mutate(id)}
          onComplete={(id, data) => completeMutation.mutate({ id, data })}
          onCancel={(id) => cancelMutation.mutate(id)}
        />
      )}

      {showNewModal && (
        <NewVisitModal
          onClose={() => setShowNewModal(false)}
          onCreate={(data) => createMutation.mutate(data)}
        />
      )}
    </div>
  )
}
