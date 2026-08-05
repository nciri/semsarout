import { useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { FiCalendar, FiCheckCircle, FiClock } from 'react-icons/fi'
import { availabilityService } from '../../services/availabilityService'
import useAuthStore from '../../store/authStore'

function nextDays(count) {
  const days = []
  const today = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d)
  }
  return days
}

function BookVisitWidget({ propertyId }) {
  const { t } = useTranslation(['common'])
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const days = nextDays(14)
  const [selectedDate, setSelectedDate] = useState(days[0].toISOString().slice(0, 10))
  const [selectedTime, setSelectedTime] = useState(null)
  const [booked, setBooked] = useState(false)

  const { data, isLoading } = useQuery(
    ['available-slots', propertyId, selectedDate],
    () => availabilityService.getAvailableSlots(propertyId, selectedDate),
    { enabled: !!propertyId }
  )

  const bookMutation = useMutation(
    () => availabilityService.bookVisit(propertyId, { date: selectedDate, time: selectedTime }),
    {
      onSuccess: () => {
        setBooked(true)
        toast.success(t('common:visit.toastBooked'))
      },
      onError: (error) => toast.error(error.response?.data?.error || t('common:visit.toastError'))
    }
  )

  const slots = data?.slots || []

  const handleBook = () => {
    if (!isAuthenticated) {
      navigate(`/connexion?redirect=/annonces/${propertyId}`)
      return
    }
    if (!selectedTime) return
    bookMutation.mutate()
  }

  if (booked) {
    return (
      <div className="card p-6 text-center">
        <FiCheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
        <p className="font-semibold text-gray-900">{t('common:visit.confirmedTitle')}</p>
        <p className="text-sm text-gray-600">
          {t('common:visit.confirmedDateTime', {
            date: new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
            time: selectedTime
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <FiCalendar className="w-5 h-5 text-primary-600" />
        {t('common:visit.heading')}
      </h3>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {days.map((d) => {
          const iso = d.toISOString().slice(0, 10)
          const isSelected = iso === selectedDate
          return (
            <button
              key={iso}
              onClick={() => { setSelectedDate(iso); setSelectedTime(null) }}
              className={`shrink-0 px-3 py-2 rounded-lg text-sm text-center min-w-[56px] ${
                isSelected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="text-xs opacity-80">{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</div>
              <div className="font-semibold">{d.getDate()}</div>
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">{t('common:visit.loadingSlots')}</div>
      ) : slots.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FiClock className="w-4 h-4" />
          {t('common:visit.noSlotsAvailable')}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-4">
          {slots.map((time) => (
            <button
              key={time}
              onClick={() => setSelectedTime(time)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                selectedTime === time
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 text-gray-700 hover:border-primary-400'
              }`}
            >
              {time}
            </button>
          ))}
        </div>
      )}

      {slots.length > 0 && (
        <button
          onClick={handleBook}
          disabled={!selectedTime || bookMutation.isLoading}
          className="btn-primary w-full justify-center disabled:opacity-50"
        >
          {bookMutation.isLoading
            ? t('common:visit.bookButtonLoading')
            : isAuthenticated
              ? t('common:visit.bookButtonConfirm')
              : t('common:visit.bookButtonLogin')}
        </button>
      )}
    </div>
  )
}

export default BookVisitWidget
