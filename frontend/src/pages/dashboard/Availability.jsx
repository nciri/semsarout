import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiPlus, FiTrash2, FiSave, FiCalendar } from 'react-icons/fi'
import { availabilityService } from '../../services/availabilityService'

const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function Availability() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery('my-availability', () => availabilityService.getMyAvailability())
  const [slots, setSlots] = useState([])

  useEffect(() => {
    if (data?.availability) {
      setSlots(data.availability.map(s => ({
        weekday: s.weekday,
        start_time: s.start_time,
        end_time: s.end_time,
        slot_minutes: s.slot_minutes
      })))
    }
  }, [data])

  const saveMutation = useMutation(
    (newSlots) => availabilityService.updateMyAvailability(newSlots),
    {
      onSuccess: () => {
        toast.success('Disponibilités enregistrées')
        queryClient.invalidateQueries('my-availability')
      },
      onError: (error) => toast.error(error.response?.data?.error || 'Erreur')
    }
  )

  const addSlot = () => {
    setSlots([...slots, { weekday: 0, start_time: '09:00', end_time: '18:00', slot_minutes: 30 }])
  }

  const updateSlot = (idx, field, value) => {
    const updated = [...slots]
    updated[idx] = { ...updated[idx], [field]: field === 'weekday' || field === 'slot_minutes' ? parseInt(value) : value }
    setSlots(updated)
  }

  const removeSlot = (idx) => {
    setSlots(slots.filter((_, i) => i !== idx))
  }

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse h-64 bg-gray-200 rounded-xl"></div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center gap-3">
        <FiCalendar className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Mes disponibilités</h1>
          <p className="text-gray-600">
            Les acheteurs pourront réserver une visite en ligne sur vos annonces, dans ces créneaux.
          </p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        {slots.length === 0 && (
          <p className="text-gray-500 text-sm">Aucun créneau défini — la réservation en ligne est désactivée sur vos annonces.</p>
        )}

        {slots.map((slot, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <select
              value={slot.weekday}
              onChange={(e) => updateSlot(idx, 'weekday', e.target.value)}
              className="input w-auto"
            >
              {WEEKDAYS.map((day, i) => (
                <option key={i} value={i}>{day}</option>
              ))}
            </select>
            <input
              type="time"
              value={slot.start_time}
              onChange={(e) => updateSlot(idx, 'start_time', e.target.value)}
              className="input w-auto"
            />
            <span className="text-gray-400">à</span>
            <input
              type="time"
              value={slot.end_time}
              onChange={(e) => updateSlot(idx, 'end_time', e.target.value)}
              className="input w-auto"
            />
            <select
              value={slot.slot_minutes}
              onChange={(e) => updateSlot(idx, 'slot_minutes', e.target.value)}
              className="input w-auto"
            >
              <option value={15}>Créneaux de 15 min</option>
              <option value={30}>Créneaux de 30 min</option>
              <option value={60}>Créneaux de 1h</option>
            </select>
            <button
              onClick={() => removeSlot(idx)}
              className="ml-auto p-2 text-gray-400 hover:text-red-600"
            >
              <FiTrash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button
          onClick={addSlot}
          className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm"
        >
          <FiPlus className="w-4 h-4" />
          Ajouter un créneau
        </button>

        <div className="pt-4 border-t">
          <button
            onClick={() => saveMutation.mutate(slots)}
            disabled={saveMutation.isLoading}
            className="btn-primary"
          >
            <FiSave className="w-4 h-4 mr-2" />
            {saveMutation.isLoading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Availability
