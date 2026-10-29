import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheck, FiEdit2, FiMail, FiPlus, FiTrash2 } from 'react-icons/fi'
import api from '../../../services/api'
import {
  stayService, MESSAGE_STATUS_TONE, STAY_TEMPLATE_PRESETS, STAY_TRIGGERS, TRIGGER_HAS_OFFSET,
} from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { EmptyState, Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import { Chip, IconAction, TD, TH } from '../components/kit'

const EMPTY = { name: '', trigger: 'before_check_in', offset_hours: '24', property_id: '', subject: '', body: '' }

function MessagesPanel() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  // `sejour` vient de la fiche d'un séjour : on ne montre alors que ses messages.
  const stayFilter = Number(params.get('sejour')) || null
  const [editing, setEditing] = useState(null)   // null = formulaire fermé
  const [form, setForm] = useState(EMPTY)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const { data, isLoading, error } = useQuery('stays-templates', () => stayService.listTemplates())
  const { data: journal } = useQuery('stays-messages', () => stayService.listMessages())
  const { data: props } = useQuery('bo-properties-min',
    async () => (await api.get('/backoffice/properties?per_page=200')).data, { enabled: editing !== null })

  const refresh = () => ['stays-templates', 'stays-messages'].forEach((k) => qc.invalidateQueries(k))
  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))
  const payload = () => ({
    name: form.name.trim(), trigger: form.trigger, subject: form.subject.trim(), body: form.body,
    offset_hours: TRIGGER_HAS_OFFSET[form.trigger] ? Number(form.offset_hours) || 0 : 0,
    property_id: form.property_id ? Number(form.property_id) : null,
  })

  const save = useMutation(() => (editing?.id
    ? stayService.updateTemplate(editing.id, payload())
    : stayService.createTemplate(payload())), {
    onSuccess: () => { toast.success(t('backoffice:stays.messages.toasts.saved')); setEditing(null); refresh() },
    onError: fail,
  })
  // Un modèle prêt à l'emploi n'est qu'un gabarit préécrit : on le crée comme les autres,
  // à charge pour l'agence de le récrire ensuite.
  const install = useMutation((preset) => stayService.createTemplate({
    name: t(`backoffice:stays.messages.presets.${preset.key}.name`),
    trigger: preset.trigger, offset_hours: preset.offset_hours, property_id: null,
    subject: t(`backoffice:stays.messages.presets.${preset.key}.subject`),
    body: t(`backoffice:stays.messages.presets.${preset.key}.body`),
  }), {
    onSuccess: (r) => {
      toast.success(t('backoffice:stays.messages.presetToast', { name: r.template?.name }))
      refresh()
    },
    onError: fail,
  })
  const remove = useMutation((id) => stayService.deleteTemplate(id), {
    onSuccess: () => { toast.success(t('backoffice:stays.messages.toasts.disabled')); refresh() },
    onError: fail,
  })

  const openNew = () => { setForm(EMPTY); setEditing({}) }
  const openEdit = (tpl) => {
    setForm({
      name: tpl.name, trigger: tpl.trigger, offset_hours: String(tpl.offset_hours ?? 0),
      property_id: tpl.property_id ? String(tpl.property_id) : '', subject: tpl.subject, body: tpl.body,
    })
    setEditing(tpl)
  }

  if (error) return <p className="px-2.5 py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>

  const templates = (data?.templates || []).filter((x) => x.active)
  // Un modèle déjà installé garde son nom : c'est ce qui dit à l'écran de ne pas le reproposer.
  const installed = new Set(templates.map((x) => x.name))
  const placeholders = data?.placeholders || []
  const messages = (journal?.messages || [])
    .filter((m) => !stayFilter || m.reservation_id === stayFilter)
  const properties = props?.properties || []

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-[14px] font-bold">{t('backoffice:stays.messages.templatesTitle')}</h3>
          <IconAction icon={FiPlus} label={t('backoffice:stays.messages.add')} onClick={openNew} tone="primary" tipAlign="end" />
        </div>

        {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />
          : !templates.length ? (
            <EmptyState icon={FiMail} title={t('backoffice:stays.messages.empty.title')}
              description={t('backoffice:stays.messages.empty.description')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead>
                  <tr>
                    <th className={TH}>{t('backoffice:stays.messages.columns.name')}</th>
                    <th className={TH}>{t('backoffice:stays.messages.columns.when')}</th>
                    <th className={TH}>{t('backoffice:stays.messages.columns.scope')}</th>
                    <th className={TH}>{t('backoffice:stays.messages.columns.subject')}</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {templates.map((tpl) => (
                    <tr key={tpl.id}>
                      <td className={TD}><b className="font-semibold">{tpl.name}</b></td>
                      <td className={TD}>
                        {TRIGGER_HAS_OFFSET[tpl.trigger]
                          ? t(`backoffice:stays.messages.whenWithOffset.${tpl.trigger}`, { count: tpl.offset_hours })
                          : t(`backoffice:stays.messages.trigger.${tpl.trigger}`)}
                      </td>
                      <td className={TD}>
                        {tpl.property_id
                          ? (properties.find((p) => p.id === tpl.property_id)?.title || `#${tpl.property_id}`)
                          : t('backoffice:stays.messages.allProperties')}
                      </td>
                      <td className={TD}>{tpl.subject}</td>
                      <td className={`${TD} text-end`}>
                        <div className="flex justify-end gap-1">
                          <IconAction icon={FiEdit2} label={t('backoffice:stays.messages.edit')} onClick={() => openEdit(tpl)} />
                          <IconAction icon={FiTrash2} label={t('backoffice:stays.messages.disable')} tone="danger" tipAlign="end"
                            onClick={() => remove.mutate(tpl.id)} disabled={remove.isLoading} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <div className="grid gap-2.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
        <div>
          <h3 className="font-display text-[14px] font-bold">{t('backoffice:stays.messages.presetsTitle')}</h3>
          <p className="text-[12.5px] text-gray-500">{t('backoffice:stays.messages.presetsHelp')}</p>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {STAY_TEMPLATE_PRESETS.map((preset) => {
            const name = t(`backoffice:stays.messages.presets.${preset.key}.name`)
            const done = installed.has(name)
            return (
              <li key={preset.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2">
                <div className="min-w-0">
                  <b className="block truncate text-[13px] font-semibold">{name}</b>
                  <span className="block text-[11.5px] text-gray-500">
                    {TRIGGER_HAS_OFFSET[preset.trigger]
                      ? t(`backoffice:stays.messages.whenWithOffset.${preset.trigger}`, { count: preset.offset_hours })
                      : t(`backoffice:stays.messages.trigger.${preset.trigger}`)}
                  </span>
                </div>
                {done ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-gray-500">
                    <FiCheck aria-hidden="true" /> {t('backoffice:stays.messages.presetAdded')}
                  </span>
                ) : (
                  <button onClick={() => install.mutate(preset)} disabled={install.isLoading}
                    className={`${SECONDARY_BTN} shrink-0`}>
                    {t('backoffice:stays.messages.presetAdd')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="grid gap-3">
        <h3 className="font-display text-[14px] font-bold">{t('backoffice:stays.messages.journalTitle')}</h3>
        {!messages.length ? (
          <p className="px-2.5 py-3 text-sm text-gray-500">{t('backoffice:stays.messages.journalEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>{t('backoffice:stays.messages.columns.stay')}</th>
                  <th className={TH}>{t('backoffice:stays.messages.columns.recipient')}</th>
                  <th className={TH}>{t('backoffice:stays.messages.columns.due')}</th>
                  <th className={TH}>{t('backoffice:stays.messages.columns.status')}</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td className={TD}>
                      <b className="block truncate font-semibold">{m.property_title || `#${m.reservation_id}`}</b>
                      <span className="block truncate text-xs text-gray-500">{m.guest_name || '—'} · {m.subject}</span>
                    </td>
                    <td className={TD}>{m.recipient || <span className="text-gray-500">{t('backoffice:stays.messages.noRecipient')}</span>}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {m.due_at ? fmtDate(m.due_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className={TD}>
                      <Chip tone={MESSAGE_STATUS_TONE[m.status] || 'neutral'}>
                        {t(`backoffice:stays.messages.status.${m.status}`, { defaultValue: m.status })}
                      </Chip>
                      {m.error && <span className="mt-0.5 block text-xs text-red-700">{m.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)}
        title={editing?.id ? t('backoffice:stays.messages.modal.editTitle') : t('backoffice:stays.messages.modal.title')}
        footer={<>
          <button onClick={() => setEditing(null)} className={SECONDARY_BTN}>{t('backoffice:stays.messages.modal.cancel')}</button>
          <button disabled={!form.name || !form.subject || !form.body || save.isLoading}
            onClick={() => save.mutate()} className={PRIMARY_BTN}>{t('backoffice:stays.messages.modal.submit')}</button>
        </>}>
        <Field label={t('backoffice:stays.messages.modal.nameLabel')} value={form.name} onChange={set('name')} />
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="tpl-trigger">
            {t('backoffice:stays.messages.modal.triggerLabel')}
          </label>
          <Select id="tpl-trigger" value={form.trigger} onChange={set('trigger')}>
            {STAY_TRIGGERS.map((x) => <option key={x} value={x}>{t(`backoffice:stays.messages.trigger.${x}`)}</option>)}
          </Select>
        </div>
        {TRIGGER_HAS_OFFSET[form.trigger] && (
          <Field label={t('backoffice:stays.messages.modal.offsetLabel')} type="number" min="0"
            value={form.offset_hours} onChange={set('offset_hours')} />
        )}
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="tpl-property">
            {t('backoffice:stays.messages.modal.propertyLabel')}
          </label>
          <Select id="tpl-property" value={form.property_id} onChange={set('property_id')}>
            <option value="">{t('backoffice:stays.messages.allProperties')}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </div>
        <Field label={t('backoffice:stays.messages.modal.subjectLabel')} value={form.subject} onChange={set('subject')} />
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="tpl-body">
            {t('backoffice:stays.messages.modal.bodyLabel')}
          </label>
          <textarea id="tpl-body" rows={7} value={form.body} onChange={set('body')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <p className="text-[12.5px] text-gray-500">
          {t('backoffice:stays.messages.modal.placeholders')} {placeholders.map((v) => `{{${v}}}`).join(' · ')}
        </p>
      </Modal>
    </div>
  )
}
export default MessagesPanel
