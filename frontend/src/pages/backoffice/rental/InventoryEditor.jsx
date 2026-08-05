import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiPlus, FiTrash2, FiUploadCloud, FiDownload, FiLock, FiCheckCircle } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, GatedNotice, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import SignaturePanel from '../../../components/backoffice/SignaturePanel'
import DirIcon from '../../../components/common/DirIcon'
import useAuthStore from '../../../store/authStore'

const COND_TONE = { bon: 'bg-emerald-50 text-emerald-700', moyen: 'bg-amber-100 text-amber-700', mauvais: 'bg-red-100 text-red-700' }

function InventoryEditor() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { invId } = useParams()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const managerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email
  const managerEmail = user?.email
  const { data: inv, isLoading, error } = useQuery(['inventory', invId], () => rentalService.getInventory(invId))
  const [newRoom, setNewRoom] = useState('')
  const refresh = () => qc.invalidateQueries(['inventory', invId])

  async function openPdf(url) {
    try { const r = await api.get(url, { responseType: 'blob' }); const u = URL.createObjectURL(r.data); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
    catch { toast.error(t('backoffice:signature.pdfUnavailable')) }
  }

  const mut = (fn, ok) => useMutation(fn, { onSuccess: () => { if (ok) toast.success(ok); refresh() }, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })
  const addRoom = mut(() => rentalService.addRoom(invId, newRoom), t('backoffice:rental.inventory.toasts.roomAdded'))
  const delRoom = mut((rid) => rentalService.deleteRoom(rid))
  const addItem = mut(({ roomId, label }) => rentalService.addItem(roomId, { label }), t('backoffice:rental.inventory.toasts.itemAdded'))
  const patchItem = mut(({ itemId, data }) => rentalService.patchItem(itemId, data))
  const delItem = mut((itemId) => rentalService.deleteItem(itemId))
  const upPhoto = mut(({ itemId, file }) => rentalService.uploadItemPhoto(itemId, file), t('backoffice:rental.inventory.toasts.photoAdded'))
  const delPhoto = mut((photoId) => rentalService.deleteItemPhoto(photoId))
  const finalize = mut(() => rentalService.finalizeInventory(invId), t('backoffice:rental.inventory.toasts.finalized'))

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.inventory.pageTitle')} message={t('backoffice:rental.inventory.gated.message')} />
  if (isLoading || !inv) return <div className="p-6 text-gray-500">{t('backoffice:rental.shared.loading')}</div>
  const ro = inv.status !== 'draft'   // read-only

  return (
    <div className="space-y-6">
      <Link to={`/backoffice/gestion-locative/baux/${inv.lease_id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.inventory.backToLease')}</Link>
      <Panel title={t(`backoffice:rental.inventory.panelTitle.${inv.type === 'entree' ? 'entry' : 'exit'}`)}
        action={<div className="flex items-center gap-2">
          <StatusBadge label={t(`backoffice:rental.inventory.status.${inv.status}`, { defaultValue: inv.status })} />
          {inv.has_pdf || ro ? <button onClick={() => openPdf(rentalService.inventoryPdfUrl(invId))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> {t('backoffice:rental.inventory.pdfButton')}</button> : null}
          {!ro && <button disabled={finalize.isLoading} onClick={() => finalize.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> {t('backoffice:rental.inventory.finalizeButton')}</button>}
        </div>}>
        {ro && <p className="text-sm text-gray-500 mb-2">{t('backoffice:rental.inventory.lockNotice')}</p>}
        <div className="space-y-5">
          {(inv.rooms || []).map((room) => (
            <div key={room.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{room.name}</h3>
                {!ro && <button onClick={() => delRoom.mutate(room.id)} className="text-gray-400 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>}
              </div>
              <div className="space-y-2">
                {room.items.map((it) => (
                  <div key={it.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-40 text-gray-700">{it.label}</span>
                    {ro ? <StatusBadge label={t(`backoffice:rental.inventory.condition.${it.condition}`, { defaultValue: it.condition })} className={COND_TONE[it.condition]} />
                      : <select value={it.condition} onChange={(e) => patchItem.mutate({ itemId: it.id, data: { condition: e.target.value } })} className="px-2 py-1 border border-gray-200 rounded-lg text-sm">
                          <option value="bon">{t('backoffice:rental.inventory.condition.bon')}</option><option value="moyen">{t('backoffice:rental.inventory.condition.moyen')}</option><option value="mauvais">{t('backoffice:rental.inventory.condition.mauvais')}</option>
                        </select>}
                    <input defaultValue={it.comment || ''} disabled={ro} placeholder={t('backoffice:rental.inventory.commentPlaceholder')} onBlur={(e) => !ro && patchItem.mutate({ itemId: it.id, data: { comment: e.target.value } })} className="flex-1 min-w-[140px] px-2 py-1 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50" />
                    {(it.photos || []).map((ph) => (
                      <span key={ph.id} className="inline-flex items-center gap-1">
                        <button onClick={() => openPdf(rentalService.inventoryPhotoUrl(ph.id))} className="text-primary-600 text-xs underline">{ph.filename}</button>
                        {!ro && <button onClick={() => delPhoto.mutate(ph.id)} className="text-gray-300 hover:text-red-600"><FiTrash2 className="w-3.5 h-3.5" /></button>}
                      </span>
                    ))}
                    {!ro && <label className="text-gray-400 hover:text-primary-600 cursor-pointer"><FiUploadCloud className="w-4 h-4" /><input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upPhoto.mutate({ itemId: it.id, file: f }); e.target.value = '' }} /></label>}
                    {!ro && <button onClick={() => delItem.mutate(it.id)} className="text-gray-300 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
                {!ro && <AddItem t={t} onAdd={(label) => addItem.mutate({ roomId: room.id, label })} />}
              </div>
            </div>
          ))}
        </div>
        {!ro && (
          <div className="flex items-center gap-2 mt-4">
            <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder={t('backoffice:rental.inventory.newRoomPlaceholder')} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <button disabled={!newRoom} onClick={() => { addRoom.mutate(); setNewRoom('') }} className={SECONDARY_BTN}><FiPlus className="w-4 h-4" /> {t('backoffice:rental.inventory.addRoomButton')}</button>
          </div>
        )}
      </Panel>
      <SignaturePanel docType="inventory" docId={invId} managerName={managerName} managerEmail={managerEmail} disabled={inv.status === 'draft'} />
    </div>
  )
}

function AddItem({ t, onAdd }) {
  const [v, setV] = useState('')
  return (
    <div className="flex items-center gap-2 pt-1">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t('backoffice:rental.inventory.addItemPlaceholder')} className="px-2 py-1 border border-gray-200 rounded-lg text-sm" />
      <button disabled={!v} onClick={() => { onAdd(v); setV('') }} className="text-primary-600 hover:text-primary-700 text-sm inline-flex items-center gap-1"><FiPlus className="w-3.5 h-3.5" /> {t('backoffice:rental.inventory.addItemButton')}</button>
    </div>
  )
}
export default InventoryEditor
