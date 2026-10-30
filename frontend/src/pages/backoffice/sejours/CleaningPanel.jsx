import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCheck, FiClock, FiPlay, FiPlus } from 'react-icons/fi'
import { stayService, CLEANING_KINDS, CLEANING_REPORT_KINDS, CLEANING_STATUS_TONE, CLEANING_ZONES } from '../../../services/stayService'
import { teamService } from '../../../services/teamService'
import api from '../../../services/api'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, IconAction, Kv, TD, TH } from '../components/kit'
import { EmptyState, Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import RichTextarea, { RichText } from '../../../components/common/RichTextarea'
import { isRichTextEmpty } from '../../../utils/richText'

const NEW_TASK = { kind: 'menage', property_id: '', scheduled_date: '', notes: '' }
const NEW_REPORT = { kind: 'issue', category: '', text_note: '', is_urgent: false }

function CleaningPanel() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const [status, setStatus] = useState(() => params.get('statut') || '')
  const [kind, setKind] = useState('')
  // `equipe` vient de la fiche d'une équipe : on ne montre que ses tâches.
  const teamFilter = Number(params.get('equipe')) || null
  // Ouvre d'emblée la tâche désignée par le lien (fiche du séjour, alerte de retard).
  const [openId, setOpenId] = useState(() => (params.get('tache') ? Number(params.get('tache')) : null))
  const [creating, setCreating] = useState(false)
  const [task, setTask] = useState(NEW_TASK)
  const [report, setReport] = useState(NEW_REPORT)
  const [photo, setPhoto] = useState(null)

  const { data, isLoading, error } = useQuery(['stays-cleanings', status, kind, teamFilter],
    () => stayService.listCleanings({ ...(status ? { status } : {}),
                                      ...(kind ? { kind } : {}),
                                      ...(teamFilter ? { team_id: teamFilter } : {}) }))
  const detail = useQuery(['stays-cleaning', openId], () => stayService.getCleaning(openId), { enabled: Boolean(openId) })
  const { data: team } = useQuery('team', teamService.getTeam)
  const { data: props } = useQuery('bo-properties-min',
    async () => (await api.get('/backoffice/properties?per_page=200')).data, { enabled: creating })

  const refresh = () => {
    qc.invalidateQueries('stays-cleanings')
    qc.invalidateQueries(['stays-cleaning', openId])
  }
  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))

  const update = useMutation(({ id, body }) => stayService.updateCleaning(id, body), { onSuccess: refresh, onError: fail })
  const create = useMutation(() => stayService.createCleaning({
    kind: task.kind, property_id: Number(task.property_id), scheduled_date: task.scheduled_date, notes: task.notes,
  }), {
    onSuccess: () => { toast.success(t('backoffice:stays.cleaning.toasts.created')); setCreating(false); setTask(NEW_TASK); refresh() },
    onError: fail,
  })
  const addReport = useMutation(async () => {
    const created = await stayService.addReport(openId, report)
    if (photo) await stayService.addReportPhoto(created.report.id, photo)
    return created
  }, {
    onSuccess: () => { toast.success(t('backoffice:stays.cleaning.toasts.reported')); setReport(NEW_REPORT); setPhoto(null); refresh() },
    onError: fail,
  })
  const markSeen = useMutation((id) => stayService.markReportSeen(id), { onSuccess: refresh, onError: fail })

  if (error) return <p className="px-2.5 py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>

  const tasks = data?.tasks || []
  const members = team?.members || []
  const properties = props?.properties || []
  const open = detail.data?.task
  const day = (iso) => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
  const memberName = (id) => members.find((m) => m.id === id)?.full_name

  const toggleZone = (zone) => {
    const done = open.zones_done || []
    update.mutate({ id: open.id, body: {
      zones_done: done.includes(zone) ? done.filter((z) => z !== zone) : [...done, zone],
    } })
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12.5px] font-medium text-gray-600" htmlFor="cleaning-status">
            {t('backoffice:stays.cleaning.statusLabel')}
          </label>
          <Select id="cleaning-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
            <option value="">{t('backoffice:stays.cleaning.allStatuses')}</option>
            {Object.keys(CLEANING_STATUS_TONE).map((s) => (
              <option key={s} value={s}>{t(`backoffice:stays.cleaning.status.${s}`)}</option>
            ))}
          </Select>
          <label className="text-[12.5px] font-medium text-gray-600" htmlFor="cleaning-kind">
            {t('backoffice:stays.cleaning.kindFilterLabel')}
          </label>
          <Select id="cleaning-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto">
            <option value="">{t('backoffice:stays.cleaning.allKinds')}</option>
            {CLEANING_KINDS.map((k) => (
              <option key={k} value={k}>{t(`backoffice:stays.cleaning.kind.${k}`)}</option>
            ))}
          </Select>
        </div>
        <IconAction icon={FiPlus} label={t('backoffice:stays.cleaning.add')} onClick={() => setCreating(true)} tone="primary" tipAlign="end" />
      </div>

      {data?.late > 0 && <Alert tone="warn" icon={FiClock}>{t('backoffice:stays.cleaning.lateAlert', { count: data.late })}</Alert>}
      {data?.urgent_reports > 0 && (
        <Alert tone="crit" icon={FiAlertTriangle}>{t('backoffice:stays.cleaning.urgentAlert', { count: data.urgent_reports })}</Alert>
      )}

      {isLoading ? <div className="h-24 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />
        : !tasks.length ? (
          <EmptyState icon={FiCheck} title={t('backoffice:stays.cleaning.empty.title')}
            description={t('backoffice:stays.cleaning.empty.description')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>{t('backoffice:stays.cleaning.columns.date')}</th>
                  <th className={TH}>{t('backoffice:stays.cleaning.columns.property')}</th>
                  <th className={TH}>{t('backoffice:stays.cleaning.columns.nextArrival')}</th>
                  <th className={TH}>{t('backoffice:stays.cleaning.columns.assignee')}</th>
                  <th className={TH}>{t('backoffice:stays.cleaning.columns.status')}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {tasks.map((x) => (
                  <tr key={x.id}>
                    <td className={`${TD} whitespace-nowrap`}>{day(x.scheduled_date)}</td>
                    <td className={TD}>
                      <b className="block truncate font-semibold">{x.property_title || `#${x.property_id}`}</b>
                      {x.guest_name && <span className="block truncate text-xs text-gray-500">{x.guest_name}</span>}
                      <Chip tone="neutral">{t(`backoffice:stays.cleaning.kind.${x.kind || 'menage'}`, { defaultValue: x.kind })}</Chip>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{x.next_check_in ? day(x.next_check_in) : '—'}</td>
                    <td className={TD}>
                      <Select aria-label={t('backoffice:stays.cleaning.columns.assignee')} value={x.assigned_to_id || ''}
                        onChange={(e) => update.mutate({ id: x.id, body: { assigned_to_id: e.target.value || null } })}
                        className="w-auto">
                        <option value="">{t('backoffice:stays.cleaning.unassigned')}</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </Select>
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={CLEANING_STATUS_TONE[x.status] || 'neutral'}>
                          {t(`backoffice:stays.cleaning.status.${x.status}`, { defaultValue: x.status })}
                        </Chip>
                        {x.urgent_count > 0 && (
                          <Chip tone="crit">
                            <FiAlertTriangle className="h-3 w-3" aria-hidden="true" />
                            {t('backoffice:stays.cleaning.urgentChip', { count: x.urgent_count })}
                          </Chip>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} text-end`}>
                      <div className="flex justify-end gap-1">
                        {x.status === 'pending' && (
                          <IconAction icon={FiPlay} label={t('backoffice:stays.cleaning.start')}
                            onClick={() => update.mutate({ id: x.id, body: { status: 'in_progress' } })} />
                        )}
                        {x.status === 'in_progress' && (
                          <IconAction icon={FiCheck} label={t('backoffice:stays.cleaning.finish')}
                            onClick={() => update.mutate({ id: x.id, body: { status: 'done' } })} />
                        )}
                        <IconAction icon={FiAlertTriangle} label={t('backoffice:stays.cleaning.openDetail')}
                          tone="gold" tipAlign="end" onClick={() => setOpenId(x.id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={Boolean(openId)} onClose={() => setOpenId(null)} maxWidth="lg"
        title={t('backoffice:stays.cleaning.detail.title')}
        footer={<button onClick={() => setOpenId(null)} className={SECONDARY_BTN}>{t('backoffice:stays.cleaning.detail.close')}</button>}>
        {!open ? <div className="h-24 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" /> : (
          <div className="grid gap-4">
            <div>
              <p className="font-semibold">{open.property_title || `#${open.property_id}`}</p>
              <p className="text-[12.5px] text-gray-500">
                {day(open.scheduled_date)}
                {open.assigned_to_id && ` · ${memberName(open.assigned_to_id) || ''}`}
              </p>
              <Kv label={t('backoffice:stays.cleaning.modal.kindLabel')}
                value={t(`backoffice:stays.cleaning.kind.${open.kind || 'menage'}`, { defaultValue: open.kind })} />
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">
                {t('backoffice:stays.cleaning.detail.zones')}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {CLEANING_ZONES.map((zone) => (
                  <label key={zone} className="inline-flex items-center gap-2 text-[13.5px]">
                    <input type="checkbox" checked={(open.zones_done || []).includes(zone)}
                      onChange={() => toggleZone(zone)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    {t(`backoffice:stays.cleaning.zones.${zone}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-2">
              <h4 className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">
                {t('backoffice:stays.cleaning.detail.reports')}
              </h4>
              {!open.reports?.length && <p className="text-sm text-gray-500">{t('backoffice:stays.cleaning.detail.noReport')}</p>}
              {(open.reports || []).map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone={r.kind === 'issue' ? 'warn' : 'neutral'}>
                        {t(`backoffice:stays.cleaning.reportKind.${r.kind}`, { defaultValue: r.kind })}
                      </Chip>
                      {r.is_urgent && <Chip tone="crit">{t('backoffice:stays.cleaning.detail.urgent')}</Chip>}
                      {r.category && <span className="text-xs text-gray-500">{r.category}</span>}
                    </div>
                    {!r.seen_at && (
                      <button type="button" onClick={() => markSeen.mutate(r.id)} className="text-xs font-semibold text-primary-700">
                        {t('backoffice:stays.cleaning.detail.markSeen')}
                      </button>
                    )}
                  </div>
                  <RichText html={r.text_note} className="mt-1.5 text-[13.5px]" />
                  {r.photos?.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-2 text-xs">
                      {r.photos.map((p) => (
                        <li key={p.id}>
                          <a href={stayService.photoUrl(p.id)} target="_blank" rel="noreferrer" className="text-primary-700 underline">
                            {p.filename}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-2 rounded-lg bg-gray-50 p-3">
              <h4 className="text-[12.5px] font-semibold uppercase tracking-wide text-gray-500">
                {t('backoffice:stays.cleaning.detail.addReport')}
              </h4>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="report-kind">
                  {t('backoffice:stays.cleaning.detail.kindLabel')}
                </label>
                <Select id="report-kind" value={report.kind} onChange={(e) => setReport((r) => ({ ...r, kind: e.target.value }))}>
                  {CLEANING_REPORT_KINDS.map((k) => (
                    <option key={k} value={k}>{t(`backoffice:stays.cleaning.reportKind.${k}`)}</option>
                  ))}
                </Select>
              </div>
              <Field label={t('backoffice:stays.cleaning.detail.categoryLabel')} value={report.category}
                onChange={(e) => setReport((r) => ({ ...r, category: e.target.value }))} />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="report-note">
                  {t('backoffice:stays.cleaning.detail.noteLabel')}
                </label>
                <RichTextarea id="report-note" rows={3} value={report.text_note}
                  onChange={(html) => setReport((r) => ({ ...r, text_note: html }))} />
              </div>
              <label className="inline-flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" checked={report.is_urgent}
                  onChange={(e) => setReport((r) => ({ ...r, is_urgent: e.target.checked }))}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                {t('backoffice:stays.cleaning.detail.urgentLabel')}
              </label>
              <label className="grid gap-1 text-sm font-medium text-gray-700">
                {t('backoffice:stays.cleaning.detail.photoLabel')}
                <input type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="text-[13px]" />
              </label>
              <div>
                <button type="button" disabled={isRichTextEmpty(report.text_note) || addReport.isLoading}
                  onClick={() => addReport.mutate()} className={PRIMARY_BTN}>
                  {t('backoffice:stays.cleaning.detail.submitReport')}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} title={t('backoffice:stays.cleaning.modal.title')}
        footer={<>
          <button onClick={() => setCreating(false)} className={SECONDARY_BTN}>{t('backoffice:stays.cleaning.modal.cancel')}</button>
          <button disabled={!task.property_id || !task.scheduled_date || create.isLoading}
            onClick={() => create.mutate()} className={PRIMARY_BTN}>{t('backoffice:stays.cleaning.modal.submit')}</button>
        </>}>
        <p className="mb-3 text-[13px] text-gray-500">{t('backoffice:stays.cleaning.modal.help')}</p>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="cleaning-new-kind">
            {t('backoffice:stays.cleaning.modal.kindLabel')}
          </label>
          <Select id="cleaning-new-kind" value={task.kind} onChange={(e) => setTask((x) => ({ ...x, kind: e.target.value }))}>
            {CLEANING_KINDS.map((k) => (
              <option key={k} value={k}>{t(`backoffice:stays.cleaning.kind.${k}`)}</option>
            ))}
          </Select>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="cleaning-property">
            {t('backoffice:stays.cleaning.modal.propertyLabel')}
          </label>
          <Select id="cleaning-property" value={task.property_id} onChange={(e) => setTask((x) => ({ ...x, property_id: e.target.value }))}>
            <option value="">{t('backoffice:stays.cleaning.modal.propertyPlaceholder')}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </div>
        <Field label={t('backoffice:stays.cleaning.modal.dateLabel')} type="date" value={task.scheduled_date}
          onChange={(e) => setTask((x) => ({ ...x, scheduled_date: e.target.value }))} />
        <Field label={t('backoffice:stays.cleaning.modal.notesLabel')} value={task.notes}
          onChange={(e) => setTask((x) => ({ ...x, notes: e.target.value }))} />
      </Modal>
    </div>
  )
}
export default CleaningPanel
