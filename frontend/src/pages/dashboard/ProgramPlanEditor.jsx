import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  FiArrowLeft, FiPlus, FiTrash2, FiSave, FiX, FiImage,
  FiEdit3, FiMousePointer, FiCheck
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

const svgPoints = (zone) => (zone || []).map(p => `${p.x * 1000},${p.y * 1000}`).join(' ')
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

function eventToNorm(e, el) {
  const rect = el.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
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
  const [creating, setCreating] = useState(false) // true when form is for a new (drafted) lot
  const [saving, setSaving] = useState(false)

  const [showAddPlan, setShowAddPlan] = useState(false)
  const [newPlanName, setNewPlanName] = useState('')
  const [uploading, setUploading] = useState(false)

  const canvasRef = useRef(null)
  const dragRef = useRef(null)                    // { index } during vertex drag of selected lot

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

  const resetSelection = () => {
    setSelectedLotId(null)
    setCreating(false)
    setDraft([])
    setForm(EMPTY_FORM)
  }

  // ---- Plans ----
  const handleAddPlan = async (e) => {
    e.preventDefault()
    if (!newPlanName.trim()) return
    try {
      const plan = await lotPlanService.createPlan(programId, { name: newPlanName.trim() })
      setPlans(p => [...p, { ...plan, lots: [] }])
      setActivePlanId(plan.id)
      setShowAddPlan(false)
      setNewPlanName('')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur')
    }
  }

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activePlan) return
    setUploading(true)
    try {
      const url = await lotPlanService.uploadImage(file)
      const updated = await lotPlanService.updatePlan(programId, activePlan.id, { image_url: url })
      setPlans(ps => ps.map(p => p.id === activePlan.id ? { ...p, image_url: updated.image_url } : p))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors du téléchargement')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDeletePlan = async () => {
    if (!activePlan) return
    if (!window.confirm(`Supprimer le plan « ${activePlan.name} » et ses lots ?`)) return
    try {
      await lotPlanService.deletePlan(programId, activePlan.id)
      const rest = plans.filter(p => p.id !== activePlan.id)
      setPlans(rest)
      setActivePlanId(rest[0]?.id ?? null)
      resetSelection()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur')
    }
  }

  // ---- Canvas interactions ----
  const handleCanvasClick = (e) => {
    if (mode !== 'draw' || !activePlan?.image_url) return
    const pt = eventToNorm(e, canvasRef.current)
    setDraft(d => [...d, pt])
  }

  const finishDraft = () => {
    if (draft.length < 3) {
      toast.info('Placez au moins 3 points pour dessiner un lot')
      return
    }
    setCreating(true)
    setSelectedLotId(null)
    setForm(EMPTY_FORM)
    setMode('select')
  }

  const selectLot = (lot) => {
    setCreating(false)
    setDraft([])
    setSelectedLotId(lot.id)
    setForm({
      reference: lot.reference || '', title: lot.title || '',
      lot_type: lot.lot_type || 'apartment', surface: lot.surface ?? '',
      rooms: lot.rooms ?? '', bedrooms: lot.bedrooms ?? '', bathrooms: lot.bathrooms ?? '',
      floor: lot.floor ?? '', price: lot.price ?? '', status: lot.status || 'available',
      description: lot.description || ''
    })
  }

  // Vertex drag for the selected saved lot
  const startVertexDrag = (index) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { index }
    window.addEventListener('pointermove', onVertexMove)
    window.addEventListener('pointerup', onVertexUp)
  }
  const onVertexMove = (e) => {
    if (!dragRef.current || !canvasRef.current || !selectedLot) return
    const pt = eventToNorm(e, canvasRef.current)
    const idx = dragRef.current.index
    setPlans(ps => ps.map(p => p.id !== activePlanId ? p : {
      ...p,
      lots: p.lots.map(l => l.id !== selectedLot.id ? l : {
        ...l, zone: l.zone.map((z, i) => i === idx ? pt : z)
      })
    }))
  }
  const onVertexUp = async () => {
    window.removeEventListener('pointermove', onVertexMove)
    window.removeEventListener('pointerup', onVertexUp)
    const idx = dragRef.current?.index
    dragRef.current = null
    if (idx == null || !selectedLot) return
    const current = plans.find(p => p.id === activePlanId)?.lots.find(l => l.id === selectedLot.id)
    if (current) {
      try { await lotPlanService.updateLot(programId, selectedLot.id, { zone: current.zone }) }
      catch { toast.error('Erreur lors du déplacement') }
    }
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
        const lot = await lotPlanService.createLot(programId, {
          ...payload, plan_id: activePlan.id, zone: draft
        })
        setPlans(ps => ps.map(p => p.id === activePlan.id ? { ...p, lots: [...p.lots, lot] } : p))
        setDraft([]); setCreating(false); selectLot(lot)
        toast.success('Lot ajouté')
      } else if (selectedLot) {
        const lot = await lotPlanService.updateLot(programId, selectedLot.id, payload)
        setPlans(ps => ps.map(p => p.id === activePlan.id
          ? { ...p, lots: p.lots.map(l => l.id === lot.id ? { ...lot } : l) } : p))
        toast.success('Lot mis à jour')
      }
      refreshCounts()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLot = async () => {
    if (!selectedLot) return
    if (!window.confirm('Supprimer ce lot ?')) return
    try {
      await lotPlanService.deleteLot(programId, selectedLot.id)
      setPlans(ps => ps.map(p => p.id === activePlan.id
        ? { ...p, lots: p.lots.filter(l => l.id !== selectedLot.id) } : p))
      resetSelection()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur')
    }
  }

  const refreshCounts = () => {
    // status_counts is recomputed server-side; keep client legend accurate locally
    setPlans(ps => ps.map(p => {
      const counts = { available: 0, reserved: 0, sold: 0 }
      p.lots.forEach(l => { if (counts[l.status] != null) counts[l.status]++ })
      return { ...p, status_counts: counts }
    }))
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse h-96 bg-gray-200 rounded-xl" />
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
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
          <button
            key={p.id}
            onClick={() => { setActivePlanId(p.id); resetSelection() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              p.id === activePlanId ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => setShowAddPlan(true)}
          className="px-3 py-2 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 inline-flex items-center gap-1"
        >
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
          {/* Canvas */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setMode('select'); setDraft([]); setCreating(false) }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                  mode === 'select' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                <FiMousePointer className="w-4 h-4" /> Sélectionner
              </button>
              <button
                onClick={() => { setMode('draw'); resetSelection() }}
                disabled={!activePlan.image_url}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 ${
                  mode === 'draw' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                <FiEdit3 className="w-4 h-4" /> Dessiner un lot
              </button>
              {mode === 'draw' && (
                <button onClick={finishDraft} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-green-600 text-white">
                  <FiCheck className="w-4 h-4" /> Terminer ({draft.length} pts)
                </button>
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 cursor-pointer hover:bg-gray-200 ml-auto">
                <FiImage className="w-4 h-4" /> {activePlan.image_url ? "Changer l'image" : 'Charger une image'}
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={uploading} />
              </label>
              <button onClick={handleDeletePlan} className="p-1.5 text-gray-400 hover:text-red-600" title="Supprimer le plan">
                <FiTrash2 className="w-4 h-4" />
              </button>
            </div>

            {mode === 'draw' && (
              <p className="text-xs text-gray-500">Cliquez sur le plan pour poser les sommets du lot, puis « Terminer ».</p>
            )}

            <div
              ref={canvasRef}
              onClick={handleCanvasClick}
              className={`relative w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50 select-none ${mode === 'draw' ? 'cursor-crosshair' : ''}`}
            >
              {activePlan.image_url ? (
                <img src={activePlan.image_url} alt={activePlan.name} className="w-full block pointer-events-none" />
              ) : (
                <div className="aspect-video flex items-center justify-center text-gray-400">
                  Chargez une image de plan pour commencer
                </div>
              )}

              {/* Polygons overlay */}
              {activePlan.image_url && (
                <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                  {lots.map(lot => {
                    const isSel = lot.id === selectedLotId
                    const color = LOT_STATUS[lot.status]?.color || '#64748b'
                    return (
                      <polygon
                        key={lot.id}
                        points={svgPoints(lot.zone)}
                        fill={color} fillOpacity={isSel ? 0.55 : 0.35}
                        stroke={color} strokeWidth={isSel ? 3 : 2}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: mode === 'select' ? 'pointer' : 'inherit', pointerEvents: mode === 'select' ? 'auto' : 'none' }}
                        onClick={(e) => { e.stopPropagation(); if (mode === 'select') selectLot(lot) }}
                      />
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

              {/* Draft point handles */}
              {mode === 'draw' && draft.map((p, i) => (
                <span key={i} className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-sky-500 ring-2 ring-white"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
              ))}

              {/* Selected lot vertex handles (draggable) */}
              {mode === 'select' && selectedLot?.zone?.map((p, i) => (
                <span key={i}
                  onPointerDown={startVertexDrag(i)}
                  className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full bg-white border-2 border-primary-600 cursor-move shadow"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
              ))}

              {/* Reference labels */}
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
                    <button onClick={handleDeleteLot} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"><FiTrash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ) : (
              <div className="card p-5 text-sm text-gray-500 sticky top-24">
                <p className="font-medium text-gray-700 mb-2">Comment faire ?</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Chargez l'image du plan.</li>
                  <li>« Dessiner un lot » puis cliquez les sommets sur le plan.</li>
                  <li>« Terminer », remplissez les infos, choisissez le statut.</li>
                  <li>En mode « Sélectionner », cliquez un lot pour l'éditer ou déplacez ses points.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add plan modal */}
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
