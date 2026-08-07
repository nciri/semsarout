import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { FiMapPin, FiX, FiCheck } from 'react-icons/fi'
import { lotPlanService, LOT_STATUS } from '../../services/lotPlanService'
import { formatPrice } from '../../utils/currency'
import useAuthStore from '../../store/authStore'

const svgPoints = (zone) => (zone || []).map(p => `${p.x * 1000},${p.y * 1000}`).join(' ')
const centroid = (zone) => {
  if (!zone?.length) return { x: 0.5, y: 0.5 }
  const s = zone.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 })
  return { x: s.x / zone.length, y: s.y / zone.length }
}

export default function LotPlanViewer({ programId }) {
  const { t } = useTranslation(['common'])
  const { user, isAuthenticated } = useAuthStore()
  const [plans, setPlans] = useState([])
  const [activePlanId, setActivePlanId] = useState(null)
  const [selected, setSelected] = useState([])          // selected lot objects
  const [hovered, setHovered] = useState(null)          // { lot, x, y }
  const [showForm, setShowForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const containerRef = useRef(null)

  useEffect(() => {
    lotPlanService.getPlans(programId)
      .then(data => {
        const withImage = data.filter(p => p.image_url && p.lots?.length)
        setPlans(withImage)
        if (withImage.length) setActivePlanId(withImage[0].id)
      })
      .catch(() => {})
  }, [programId])

  useEffect(() => {
    if (isAuthenticated && user) {
      setForm(f => ({
        ...f,
        name: f.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        email: f.email || user.email || '',
        phone: f.phone || user.phone || ''
      }))
    }
  }, [isAuthenticated, user])

  if (!plans.length) return null

  const activePlan = plans.find(p => p.id === activePlanId)
  const lots = activePlan?.lots || []
  const isSelected = (lot) => selected.some(l => l.id === lot.id)

  const toggleLot = (lot) => {
    if (lot.status !== 'available') return
    setSelected(prev => prev.some(l => l.id === lot.id)
      ? prev.filter(l => l.id !== lot.id)
      : [...prev, lot])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.phone) {
      toast.error(t('common:lotPlan.validationNameAndPhone'))
      return
    }
    setSending(true)
    try {
      await lotPlanService.expressInterest(programId, {
        lot_ids: selected.map(l => l.id),
        name: form.name, email: form.email, phone: form.phone,
        message: form.message
      })
      setSent(true)
      setShowForm(false)
      setSelected([])
    } catch (err) {
      toast.error(err.response?.data?.error || t('common:errors.generic'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <FiMapPin className="w-5 h-5 text-primary-600" /> {t('common:lotPlan.heading')}
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {t('common:lotPlan.description')}
      </p>

      {/* Plan selector */}
      {plans.length > 1 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {plans.map(p => (
            <button key={p.id} onClick={() => setActivePlanId(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                p.id === activePlanId ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
        {Object.entries(LOT_STATUS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-gray-600">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: v.color }} />
            {t(`common:lotPlan.status.${k}`)} ({activePlan?.status_counts?.[k] ?? 0})
          </span>
        ))}
      </div>

      {/* Plan canvas */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50"
        onMouseLeave={() => setHovered(null)}
      >
        <img src={activePlan.image_url} alt={activePlan.name} className="w-full block" />
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {lots.map(lot => {
            const color = LOT_STATUS[lot.status]?.color || '#64748b'
            const sel = isSelected(lot)
            const available = lot.status === 'available'
            return (
              <polygon
                key={lot.id}
                points={svgPoints(lot.zone)}
                fill={color}
                fillOpacity={sel ? 0.7 : available ? 0.4 : 0.5}
                stroke={sel ? '#0B1220' : color}
                strokeWidth={sel ? 4 : 2}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: available ? 'pointer' : 'not-allowed' }}
                onClick={() => toggleLot(lot)}
                onMouseMove={(e) => {
                  const rect = containerRef.current.getBoundingClientRect()
                  setHovered({ lot, x: e.clientX - rect.left, y: e.clientY - rect.top })
                }}
              />
            )
          })}
        </svg>

        {/* Reference labels */}
        {lots.map(lot => {
          const c = centroid(lot.zone)
          return (
            <span key={lot.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] font-bold text-white px-1.5 py-0.5 rounded pointer-events-none"
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, backgroundColor: LOT_STATUS[lot.status]?.color }}>
              {isSelected(lot) ? <FiCheck className="w-3 h-3 inline" /> : (lot.reference || '')}
            </span>
          )
        })}

        {/* Tooltip */}
        {hovered && (
          <div className="absolute z-10 pointer-events-none bg-midnight text-white text-xs rounded-lg px-3 py-2 shadow-lg"
            style={{ left: hovered.x + 12, top: hovered.y + 12, maxWidth: 200 }}>
            <div className="font-bold">{hovered.lot.reference || t('common:lotPlan.lotFallback')}</div>
            <div className="opacity-80">{t(`common:lotPlan.status.${hovered.lot.status}`)}</div>
            {hovered.lot.surface > 0 && <div>{hovered.lot.surface} m²</div>}
            {hovered.lot.price > 0 && <div className="text-primary-300 font-semibold">{formatPrice(hovered.lot.price)}</div>}
          </div>
        )}
      </div>

      {sent && (
        <div className="mt-3 p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
          <FiCheck className="w-4 h-4" /> {t('common:lotPlan.sentMessage')}
        </div>
      )}

      {/* Selection bar */}
      {selected.length > 0 && !showForm && (
        <div className="mt-3 flex items-center justify-between gap-3 p-3 bg-primary-50 border border-primary-100 rounded-lg">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">{t('common:lotPlan.lotsCount', { count: selected.length })}</span>{' '}
            {t('common:lotPlan.selectedSuffix', { count: selected.length })} :{' '}
            {selected.map(l => l.reference || `#${l.id}`).join(', ')}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setSelected([])} className="text-sm text-gray-500 hover:text-gray-700">{t('common:lotPlan.clearButton')}</button>
            <button onClick={() => setShowForm(true)} className="btn-primary text-sm py-2">{t('common:lotPlan.requestInfoButton')}</button>
          </div>
        </div>
      )}

      {/* Interest form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t('common:lotPlan.modalTitle')}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><FiX className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {t('common:lotPlan.lotsLabel')} <span className="font-medium text-gray-700">{selected.map(l => l.reference || `#${l.id}`).join(', ')}</span>
            </p>
            <div className="space-y-3">
              <input className="input" placeholder={t('common:lotPlan.namePlaceholder')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              <input className="input" placeholder={t('common:lotPlan.phonePlaceholder')} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
              <input className="input" type="email" placeholder={t('common:lotPlan.emailPlaceholder')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <textarea className="input" rows={3} placeholder={t('common:lotPlan.messagePlaceholder')}
                value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
            </div>
            <button type="submit" disabled={sending} className="btn-primary w-full justify-center mt-4">
              {sending ? t('common:lotPlan.sendingButton') : t('common:lotPlan.sendButton')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
