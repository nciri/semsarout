import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiX } from 'react-icons/fi'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'
import { IconAction } from '../components/kit'
import { formPayload, toInputValue } from './model'

const P = 'crm.pipeline.visits'
const DURATIONS = [15, 30, 45, 60, 90]
const ctrl = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500'
const lbl = 'mb-1 block text-sm font-medium text-gray-700'
const Star = () => <span className="text-red-500"> *</span>

// Mêmes clés et mêmes formes de réponse que les autres écrans du back-office : cache partagé.
const useOptions = () => ({
  properties: useQuery('bo-properties-min', async () => (await api.get('/backoffice/properties?per_page=100')).data).data?.properties || [],
  clients: useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data).data?.clients || [],
  agents: useQuery('backoffice-agents', async () => {
    try { return (await api.get('/backoffice/users?role=agent')).data } catch { return { users: [] } }
  }).data?.users || [],
})

/** Création (visit absent) ou modification d'une visite, en fenêtre modale. */
export default function VisitForm({ visit, onClose, onSubmit, saving }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { properties, clients, agents } = useOptions()
  const [f, setF] = useState(() => ({
    property_id: visit?.property_id ?? '', client_id: visit?.client_id ?? '', agent_id: visit?.agent_id ?? '',
    visitor_name: visit?.visitor_name || '', visitor_email: visit?.visitor_email || '', visitor_phone: visit?.visitor_phone || '',
    scheduled_at: toInputValue(visit?.scheduled_at), duration_minutes: visit?.duration_minutes || 30, notes: visit?.notes || '',
  }))
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const setVal = (k) => (v) => setF((x) => ({ ...x, [k]: v ?? '' }))
  const first = useRef(null)
  useEffect(() => { first.current?.focus() }, [])

  const nameRequired = !f.client_id
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-form-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSubmit(formPayload(f)) }}
        className="grid w-full max-w-2xl gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="visit-form-title" className="font-display text-base font-bold">{visit ? t('form.editTitle') : t('form.createTitle')}</h2>
          <IconAction icon={FiX} label={t('form.close')} onClick={onClose} tipAlign="end" className="-m-2" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={lbl}>{t('form.property')}</span>
            <SearchableSelect value={f.property_id} onChange={setVal('property_id')} clearable placeholder={t('form.propertyPlaceholder')}
              options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))} />
          </div>
          <div>
            <span className={lbl}>{t('form.client')}</span>
            <SearchableSelect value={f.client_id} onChange={setVal('client_id')} clearable placeholder={t('form.clientPlaceholder')}
              options={clients.map((c) => ({ value: c.id, label: `${c.first_name || ''} ${c.last_name || ''}`.trim(), description: c.email || c.phone }))} />
          </div>
          <label className="sm:col-span-2">
            <span className={lbl}>{t('form.visitorName')}{nameRequired && <Star />}</span>
            <input ref={first} type="text" required={nameRequired} value={f.visitor_name} onChange={set('visitor_name')} className={ctrl} />
            {nameRequired && <span className="mt-1 block text-xs text-gray-500">{t('form.visitorHint')}</span>}
          </label>
          <label>
            <span className={lbl}>{t('form.email')}</span>
            <input type="email" value={f.visitor_email} onChange={set('visitor_email')} className={ctrl} />
          </label>
          <label>
            <span className={lbl}>{t('form.phone')}</span>
            <input type="tel" dir="ltr" value={f.visitor_phone} onChange={set('visitor_phone')} className={ctrl} />
          </label>
          <label>
            <span className={lbl}>{t('form.dateTime')}<Star /></span>
            <input type="datetime-local" required value={f.scheduled_at} onChange={set('scheduled_at')} className={ctrl} />
          </label>
          <label>
            <span className={lbl}>{t('form.duration')}</span>
            <select value={f.duration_minutes} onChange={set('duration_minutes')} className={ctrl}>
              {DURATIONS.map((d) => <option key={d} value={d}>{t(`form.durations.${d}`)}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <span className={lbl}>{t('form.agent')}</span>
            <SearchableSelect value={f.agent_id} onChange={setVal('agent_id')} clearable placeholder={t('form.agentPlaceholder')}
              options={agents.map((a) => ({ value: a.id, label: `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email, description: a.email }))} />
          </div>
          <label className="sm:col-span-2">
            <span className={lbl}>{t('form.notes')}</span>
            <textarea rows={3} value={f.notes} onChange={set('notes')} placeholder={t('form.notesPlaceholder')} className={ctrl} />
          </label>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="rounded-lg bg-primary-400 px-5 py-2 text-sm font-semibold text-[#241906] hover:bg-primary-600 disabled:opacity-60">
            {t('form.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
