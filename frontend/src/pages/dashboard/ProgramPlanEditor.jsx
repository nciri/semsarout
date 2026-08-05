import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  FiArrowLeft, FiPlus, FiTrash2, FiSave, FiX, FiImage,
  FiEdit3, FiMousePointer, FiCheck, FiRotateCcw, FiZoomIn, FiZoomOut
} from 'react-icons/fi'
import { lotPlanService, LOT_STATUS } from '../../services/lotPlanService'

const LOT_TYPES = [
  { value: 'apartment', label: 'Appartement' },
  { value: 'villa', label: 'Villa' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'studio', label: 'Studio' },
  { value: 'terrain', label: 'Terrain' },
  { value: 'commercial', label: 'Local commercial' },
  { value: 'office', label: 'Bureau' }
]

const EMPTY_FORM = {
  reference: '', title: '', lot_type: 'apartment', surface: '', rooms: '',
  bedrooms: '', bathrooms: '', floor: '', price: '', status: 'available', description: ''
}
const HISTORY_MAX = 10
const MIN_ZOOM = 1, MAX_ZOOM = 3, ZOOM_STEP = 0.25
const DRAG_THRESHOLD = 0.006  // normalized movement above which a press counts as a drag

const svgPoints = (zone) => (zone || []).map(p => `${p.x * 1000},${p.y * 1000}`).join(' ')
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const cloneZone = (zone) => (zone || []).map(p => ({ x: p.x, y: p.y }))

// Duplication d'un lot : référence suffixée, zone légèrement décalée (à repositionner),
// statut remis à "available" (un nouveau lot physique est disponible).
const DUP_OFFSET = 0.03
export const nextReference = (ref) => `${ref || 'LOT'}-copie`
export const offsetZone = (zone) => (zone || []).map(p => ({ x: clamp01(p.x + DUP_OFFSET), y: clamp01(p.y + DUP_OFFSET) }))
export const duplicateLotPayload = (lot) => ({
  reference: nextReference(lot.reference), title: lot.title || '', lot_type: lot.lot_type || 'apartment',
  surface: lot.surface ?? null, rooms: lot.rooms ?? null, bedrooms: lot.bedrooms ?? null,
  bathrooms: lot.bathrooms ?? null, floor: lot.floor ?? null, price: lot.price ?? null,
  status: 'available', description: lot.description || '', zone: offsetZone(lot.zone),
})

function eventToNorm(e, el) {
  const rect = el.getBoundingClientRect()
  return {
    x: clamp01((e.clientX - rect.left) / rect.width),
    y: clamp01((e.clientY - rect.top) / rect.height)
  }
}

export default function ProgramPlanEditor() {
  const { id: programId } = useParams()
  const [plans, setPlans] = useState([])
  const [activePlanId, setActivePlanId] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState('select')     // 'select' | 'draw'
  const [draft, setDraft] = useState([])          // points of a new lot being drawn
  const [selectedLotId, setSelectedLotId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1)

  const [showAddPlan, setShowAddPlan] = useState(false)
  const [newPlanName, setNewPlanName] = useState('')
  const [uploading, setUploading] = useState(false)

  const [history, setHistory] = useState([])      // stack of async undo closures
  const [undoing, setUndoing] = useState(false)

  const canvasRef = useRef(null)
  const vertexDrag = useRef(null)                 // { index, origZone }
  const lotDrag = useRef(null)                    // { lotId, startNorm, origZone, moved }

  const activePlan = plans.find(p => p.id === activePlanId)
  const lots = activePlan?.lots || []
  const selectedLot = lots.find(l => l.id === selectedLotId)

  useEffect(() => { load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const data = await lotPlanService.getPlans(programId)
      setPlans(data)
      setActivePlanId(prev => prev || (data[0]?.id ?? null))
    } catch {
      toast.error('Erreur lors du chargement des plans')
    } finally {
      setLoading(false)
    }
  }

  const pushHistory = (undoFn) => setHistory(h => [...h, undoFn].slice(-HISTORY_MAX))

  const undo = useCallback(async () => {
    setHistory(h => {
      if (!h.length) return h
      const last = h[h.length - 1]
      setUndoing(true)
      Promise.resolve(last())
        .catch(() => toast.error("Impossible d'annuler cette action"))
        .finally(() => setUndoing(false))
      return h.slice(0, -1)
    })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  const resetSelection = () => {
    setSelectedLotId(null); setCreating(false); setDraft([]); setForm(EMPTY_FORM)
  }

  // ---- local state helpers ----
  const setLotZoneLocal = (planId, lotId, zone) => setPlans(ps => ps.map(p =>
    p.id !== planId ? p : { ...p, lots: p.lots.map(l => l.id === lotId ? { ...l, zone } : l) }))
  const upsertLotLocal = (planId, lot) => setPlans(ps => ps.map(p =>
    p.id !== planId ? p : { ...p, lots: [...p.lots.filter(l => l.id !== lot.id), lot] }))
  const removeLotLocal = (planId, lotId) => setPlans(ps => ps.map(p =>
    p.id !== planId ? p : { ...p, lots: p.lots.filter(l => l.id !== lotId) }))
  const recomputeCounts = (planId) => setPlans(ps => ps.map(p => {
    if (p.id !== planId) return p
    const counts = { available: 0, reserved: 0, sold: 0 }
    p.lots.forEach(l => { if (counts[l.status] != null) counts[l.status]++ })
    return { ...p, status_counts: counts }
  }))

  // ---- Plans ----
  const handleAddPlan = async (e) => {
    e.preventDefault()
    if (!newPlanName.trim()) return
    try {
      const plan = await lotPlanService.createPlan(programId, { name: newPlanName.trim() })
      setPlans(p => [...p, { ...plan, lots: [] }])
      setActivePlanId(plan.id)
      setShowAddPlan(false); setNewPlanName('')
      pushHistory(async () => {
        await lotPlanService.deletePlan(programId, plan.id)
        setPlans(ps => { const rest = ps.filter(p => p.id !== plan.id); setActivePlanId(rest[0]?.id ?? null); return rest })
      })
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur') }
  }

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activePlan) return
    setUploading(true)
    try {
      const url = await lotPlanService.uploadImage(file)
      await lotPlanService.updatePlan(programId, activePlan.id, { image_url: url })
      setPlans(ps => ps.map(p => p.id === activePlan.id ? { ...p, image_url: url } : p))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors du téléchargement')
    } finally { setUploading(false); e.target.value = '' }
  }

  const handleDeletePlan = async () => {
    if (!activePlan) return
    if (!window.confirm(`Supprimer le plan « ${activePlan.name} » et ses lots ?`)) return
    try {
      await lotPlanService.deletePlan(programId, activePlan.id)
      const rest = plans.filter(p => p.id !== activePlan.id)
      setPlans(rest); setActivePlanId(rest[0]?.id ?? null); resetSelection()
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur') }
  }

  // ---- Canvas: draw ----
  const handleCanvasClick = (e) => {
    if (mode !== 'draw' || !activePlan?.image_url) return
    setDraft(d => [...d, eventToNorm(e, canvasRef.current)])
  }
  const finishDraft = () => {
    if (draft.length < 3) { toast.info('Placez au moins 3 points pour dessiner un lot'); return }
    setCreating(true); setSelectedLotId(null); setForm(EMPTY_FORM); setMode('select')
  }

  const selectLot = (lot) => {
    setCreating(false); setDraft([]); setSelectedLotId(lot.id)
    setForm({
      reference: lot.reference || '', title: lot.title || '', lot_type: lot.lot_type || 'apartment',
      surface: lot.surface ?? '', rooms: lot.rooms ?? '', bedrooms: lot.bedrooms ?? '',
      bathrooms: lot.bathrooms ?? '', floor: lot.floor ?? '', price: lot.price ?? '',
      status: lot.status || 'available', description: lot.description || ''
    })
  }

  // ---- Whole-lot drag / click ----
  const startLotInteraction = (lot) => (e) => {
    if (mode !== 'select') return
    e.stopPropagation()
    lotDrag.current = {
      lotId: lot.id, startNorm: eventToNorm(e, canvasRef.current),
      origZone: cloneZone(lot.zone), moved: false
    }
    window.addEventListener('pointermove', onLotMove)
    window.addEventListener('pointerup', onLotUp)
  }
  const onLotMove = (e) => {
    const d = lotDrag.current
    if (!d) return
    const cur = eventToNorm(e, canvasRef.current)
    const dx = cur.x - d.startNorm.x, dy = cur.y - d.startNorm.y
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) d.moved = true
    const zone = d.origZone.map(p => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) }))
    setLotZoneLocal(activePlanId, d.lotId, zone)
  }
  const onLotUp = async () => {
    window.removeEventListener('pointermove', onLotMove)
    window.removeEventListener('pointerup', onLotUp)
    const d = lotDrag.current
    lotDrag.current = null
    if (!d) return
    const lot = plans.find(p => p.id === activePlanId)?.lots.find(l => l.id === d.lotId)
    if (!d.moved) { if (lot) selectLot(lot); return }
    if (lot) {
      try {
        await lotPlanService.updateLot(programId, d.lotId, { zone: lot.zone })
        pushHistory(async () => {
          await lotPlanService.updateLot(programId, d.lotId, { zone: d.origZone })
          setLotZoneLocal(activePlanId, d.lotId, d.origZone)
        })
      } catch { toast.error('Erreur lors du déplacement') }
    }
  }

  // ---- Vertex drag ----
  const startVertexDrag = (index) => (e) => {
    e.preventDefault(); e.stopPropagation()
    vertexDrag.current = { index, origZone: cloneZone(selectedLot.zone) }
    window.addEventListener('pointermove', onVertexMove)
    window.addEventListener('pointerup', onVertexUp)
  }
  const onVertexMove = (e) => {
    const d = vertexDrag.current
    if (!d || !selectedLot) return
    const pt = eventToNorm(e, canvasRef.current)
    setPlans(ps => ps.map(p => p.id !== activePlanId ? p : {
      ...p, lots: p.lots.map(l => l.id !== selectedLot.id ? l : { ...l, zone: l.zone.map((z, i) => i === d.index ? pt : z) })
    }))
  }
  const onVertexUp = async () => {
    window.removeEventListener('pointermove', onVertexMove)
    window.removeEventListener('pointerup', onVertexUp)
    const d = vertexDrag.current
    vertexDrag.current = null
    if (!d || !selectedLot) return
    const lot = plans.find(p => p.id === activePlanId)?.lots.find(l => l.id === selectedLot.id)
    if (!lot) return
    try {
      await lotPlanService.updateLot(programId, lot.id, { zone: lot.zone })
      pushHistory(async () => {
        await lotPlanService.updateLot(programId, lot.id, { zone: d.origZone })
        setLotZoneLocal(activePlanId, lot.id, d.origZone)
      })
    } catch { toast.error('Erreur lors du déplacement') }
  }

  // ---- Save / delete lot ----
  const handleSaveLot = async () => {
    setSaving(true)
    const payload = {
      reference: form.reference, title: form.title, lot_type: form.lot_type,
      surface: num(form.surface), rooms: num(form.rooms), bedrooms: num(form.bedrooms),
      bathrooms: num(form.bathrooms), floor: num(form.floor), price: num(form.price),
      status: form.status, description: form.description
    }
    try {
      if (creating) {
        const lot = await lotPlanService.createLot(programId, { ...payload, plan_id: activePlan.id, zone: draft })
        upsertLotLocal(activePlan.id, lot); recomputeCounts(activePlan.id)
        setDraft([]); resetSelection()
        pushHistory(async () => {
          await lotPlanService.deleteLot(programId, lot.id)
          removeLotLocal(activePlan.id, lot.id); recomputeCounts(activePlan.id); resetSelection()
        })
        toast.success('Lot ajouté')
      } else if (selectedLot) {
        const before = { ...selectedLot }
        const lot = await lotPlanService.updateLot(programId, selectedLot.id, payload)
        upsertLotLocal(activePlan.id, lot); recomputeCounts(activePlan.id)
        pushHistory(async () => {
          const restored = await lotPlanService.updateLot(programId, before.id, {
            reference: before.reference, title: before.title, lot_type: before.lot_type,
            surface: before.surface, rooms: before.rooms, bedrooms: before.bedrooms,
            bathrooms: before.bathrooms, floor: before.floor, price: before.price,
            status: before.status, description: before.description
          })
          upsertLotLocal(activePlan.id, restored); recomputeCounts(activePlan.id)
        })
        toast.success('Lot mis à jour')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur')
    } finally { setSaving(false) }
  }

  const handleDeleteLot = async (lot) => {
    if (!lot) return
    if (!window.confirm('Supprimer ce lot ?')) return
    const before = { ...lot, zone: cloneZone(lot.zone) }
    try {
      await lotPlanService.deleteLot(programId, lot.id)
      removeLotLocal(activePlan.id, lot.id); recomputeCounts(activePlan.id)
      if (selectedLotId === lot.id) resetSelection()
      pushHistory(async () => {
        const re = await lotPlanService.createLot(programId, {
          plan_id: activePlan.id, zone: before.zone, reference: before.reference, title: before.title,
          lot_type: before.lot_type, surface: before.surface, rooms: before.rooms, bedrooms: before.bedrooms,
          bathrooms: before.bathrooms, floor: before.floor, price: before.price, status: before.status,
          description: before.description
        })
        upsertLotLocal(activePlan.id, re); recomputeCounts(activePlan.id)
      })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  const handleDuplicateLot = async (lot) => {
    try {
      const created = await lotPlanService.createLot(programId, {
        ...duplicateLotPayload(lot), plan_id: activePlan.id,
      })
      upsertLotLocal(activePlan.id, created); recomputeCounts(activePlan.id)
      pushHistory(async () => {
        await lotPlanService.deleteLot(programId, created.id)
        removeLotLocal(activePlan.id, created.id); recomputeCounts(activePlan.id)
      })
      toast.success('Lot dupliqué')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la duplication')
    }
  }

  const iconBtn = (active) =>
    `p-2 rounded-lg ${active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse h-96 bg-gray-200 rounded-xl" />
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/dashboard/programmes/${programId}`} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
          <FiArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan interactif des lots</h1>
          <p className="text-gray-500">Placez et gérez vos lots directement sur le plan.</p>
        </div>
      </div>

      {/* Plan tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {plans.map(p => (
          <button key={p.id} onClick={() => { setActivePlanId(p.id); resetSelection() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${p.id === activePlanId ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {p.name}
          </button>
        ))}
        <button onClick={() => setShowAddPlan(true)}
          className="px-3 py-2 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 inline-flex items-center gap-1">
          <FiPlus className="w-4 h-4" /> Ajouter un plan
        </button>
      </div>

      {!activePlan ? (
        <div className="card p-12 text-center text-gray-500">
          <FiImage className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          Créez un premier plan pour commencer à placer vos lots.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {/* Icon toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button title="Sélectionner / déplacer" onClick={() => { setMode('select'); setDraft([]); setCreating(false) }} className={iconBtn(mode === 'select')}>
                <FiMousePointer className="w-4 h-4" />
              </button>
              <button title="Dessiner un lot" onClick={() => { setMode('draw'); resetSelection() }} disabled={!activePlan.image_url}
                className={`${iconBtn(mode === 'draw')} disabled:opacity-40`}>
                <FiEdit3 className="w-4 h-4" />
              </button>
              {mode === 'draw' && (
                <button title={`Terminer le tracé (${draft.length} points)`} onClick={finishDraft} className="p-2 rounded-lg bg-green-600 text-white">
                  <FiCheck className="w-4 h-4" />
                </button>
              )}
              <button title="Annuler la dernière action (Ctrl+Z)" onClick={undo} disabled={!history.length || undoing}
                className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">
                <FiRotateCcw className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1 ml-2">
                <button title="Dézoomer" onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))} disabled={zoom <= MIN_ZOOM}
                  className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">
                  <FiZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button title="Zoomer" onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))} disabled={zoom >= MAX_ZOOM}
                  className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">
                  <FiZoomIn className="w-4 h-4" />
                </button>
              </div>

              <label title={activePlan.image_url ? "Changer l'image du plan" : 'Charger une image de plan'}
                className="p-2 rounded-lg bg-gray-100 text-gray-700 cursor-pointer hover:bg-gray-200 ml-auto">
                <FiImage className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={uploading} />
              </label>
              <button title="Supprimer le plan" onClick={handleDeletePlan} className="p-2 text-gray-400 hover:text-red-600">
                <FiTrash2 className="w-4 h-4" />
              </button>
            </div>

            {mode === 'draw' && (
              <p className="text-xs text-gray-500">Cliquez sur le plan pour poser les sommets du lot, puis validez avec ✓.</p>
            )}

            {/* Zoomable canvas */}
            <div className="w-full max-h-[72vh] overflow-auto rounded-xl border border-gray-200 bg-gray-50">
              <div
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{ width: `${zoom * 100}%` }}
                className={`relative select-none ${mode === 'draw' ? 'cursor-crosshair' : ''}`}
              >
                {activePlan.image_url ? (
                  <img src={activePlan.image_url} alt={activePlan.name} className="w-full block pointer-events-none" draggable={false} />
                ) : (
                  <div className="aspect-video flex items-center justify-center text-gray-400">
                    Chargez une image de plan pour commencer
                  </div>
                )}

                {activePlan.image_url && (
                  <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                    {lots.map(lot => {
                      const isSel = lot.id === selectedLotId
                      const color = LOT_STATUS[lot.status]?.color || '#64748b'
                      return (
                        <polygon key={lot.id} points={svgPoints(lot.zone)}
                          fill={color} fillOpacity={isSel ? 0.55 : 0.35}
                          stroke={color} strokeWidth={isSel ? 3 : 2} vectorEffect="non-scaling-stroke"
                          style={{ cursor: mode === 'select' ? 'move' : 'inherit', pointerEvents: mode === 'select' ? 'auto' : 'none' }}
                          onPointerDown={startLotInteraction(lot)} />
                      )
                    })}
                    {creating && draft.length > 0 && (
                      <polygon points={svgPoints(draft)} fill="#0ea5e9" fillOpacity={0.3} stroke="#0ea5e9" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    )}
                    {mode === 'draw' && draft.length > 0 && (
                      <polyline points={svgPoints(draft)} fill="none" stroke="#0ea5e9" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" />
                    )}
                  </svg>
                )}

                {mode === 'draw' && draft.map((p, i) => (
                  <span key={i} className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-sky-500 ring-2 ring-white pointer-events-none"
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
                ))}

                {mode === 'select' && selectedLot?.zone?.map((p, i) => (
                  <span key={i} onPointerDown={startVertexDrag(i)}
                    className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full bg-white border-2 border-primary-600 cursor-move shadow"
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
                ))}

                {activePlan.image_url && lots.map(lot => {
                  if (!lot.zone?.length) return null
                  const c = lot.zone.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 })
                  const cx = c.x / lot.zone.length, cy = c.y / lot.zone.length
                  return (
                    <span key={lot.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] font-bold text-white px-1.5 py-0.5 rounded pointer-events-none"
                      style={{ left: `${cx * 100}%`, top: `${cy * 100}%`, backgroundColor: LOT_STATUS[lot.status]?.color }}>
                      {lot.reference || '—'}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-sm">
              {Object.entries(LOT_STATUS).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: v.color }} />
                  {v.label} ({activePlan.status_counts?.[k] ?? 0})
                </span>
              ))}
            </div>
          </div>

          {/* Lot form panel */}
          <div className="lg:col-span-1">
            {(creating || selectedLot) ? (
              <div className="card p-5 space-y-3 sticky top-24">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{creating ? 'Nouveau lot' : `Lot ${form.reference || ''}`}</h3>
                  <button onClick={resetSelection} className="p-1 text-gray-400 hover:text-gray-600"><FiX className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Référence" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
                  <select className="input" value={form.lot_type} onChange={e => setForm({ ...form, lot_type: e.target.value })}>
                    {LOT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <input className="input" placeholder="Titre (optionnel)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" type="number" placeholder="Surface m²" value={form.surface} onChange={e => setForm({ ...form, surface: e.target.value })} />
                  <input className="input" type="number" placeholder="Prix (Dh)" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                  <input className="input" type="number" placeholder="Pièces" value={form.rooms} onChange={e => setForm({ ...form, rooms: e.target.value })} />
                  <input className="input" type="number" placeholder="Chambres" value={form.bedrooms} onChange={e => setForm({ ...form, bedrooms: e.target.value })} />
                  <input className="input" type="number" placeholder="SDB" value={form.bathrooms} onChange={e => setForm({ ...form, bathrooms: e.target.value })} />
                  <input className="input" type="number" placeholder="Étage" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Statut</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(LOT_STATUS).map(([k, v]) => (
                      <button key={k} type="button" onClick={() => setForm({ ...form, status: k })}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium border-2 ${form.status === k ? 'text-white' : 'text-gray-600 bg-white'}`}
                        style={form.status === k ? { backgroundColor: v.color, borderColor: v.color } : { borderColor: '#e5e7eb' }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea className="input" rows={2} placeholder="Description (optionnel)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSaveLot} disabled={saving} className="btn-primary flex-1 justify-center">
                    <FiSave className="w-4 h-4 mr-2" /> {saving ? '...' : 'Enregistrer'}
                  </button>
                  {selectedLot && (
                    <button onClick={() => handleDeleteLot(selectedLot)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"><FiTrash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ) : (
              <div className="card p-5 text-sm text-gray-500 sticky top-24">
                <p className="font-medium text-gray-700 mb-2">Comment faire ?</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Chargez l'image du plan (icône image).</li>
                  <li>Outil crayon, cliquez les sommets, validez avec ✓.</li>
                  <li>Remplissez les infos et choisissez le statut.</li>
                  <li>Outil flèche : cliquez un lot pour l'éditer, glissez-le pour le déplacer, ou glissez ses points.</li>
                  <li>Zoom +/− pour affiner, flèche retour ↺ pour annuler.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAddPlan} className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-lg mb-4">Nouveau plan</h3>
            <input autoFocus className="input mb-4" placeholder="Nom (ex: Plan de masse, Étage 3)"
              value={newPlanName} onChange={e => setNewPlanName(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAddPlan(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
