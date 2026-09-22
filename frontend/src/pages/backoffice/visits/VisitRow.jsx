import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiArrowUpRight, FiCheck, FiCheckCircle, FiChevronDown, FiEdit2, FiFileText, FiSlash, FiTrash2, FiUserX, FiX,
} from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Chip, IconAction } from '../components/kit'
import { actionsFor, isOverdue } from './model'

const P = 'crm.pipeline.visits'
const STATUS_TONE = { scheduled: 'warn', confirmed: 'good', completed: 'good', cancelled: 'neutral', no_show: 'crit' }
const FEEDBACK_TONE = { very_interested: 'good', interested: 'good', neutral: 'neutral', not_interested: 'crit' }
const FEEDBACKS = Object.keys(FEEDBACK_TONE)
const ICONS = { confirm: FiCheckCircle, complete: FiCheck, report: FiFileText, no_show: FiUserX, cancel: FiSlash, edit: FiEdit2, delete: FiTrash2 }
const QUICK = ['complete', 'no_show', 'cancel']

export function StatusChip({ visit, now }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  if (isOverdue(visit, now)) return <Chip tone="crit">{t('overdueChip')}</Chip>
  return <Chip tone={STATUS_TONE[visit.status] || 'neutral'}>{t(`status.${visit.status}`, { defaultValue: visit.status })}</Chip>
}

function Section({ title, children }) {
  return (
    <div className="grid content-start gap-1 text-[13px]">
      <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {children}
    </div>
  )
}

const ctrl = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function ReportForm({ visit, onSave, onClose, saving }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const [f, setF] = useState({ report: visit.report || '', client_feedback: visit.client_feedback || '', client_comments: visit.client_comments || '' })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const id = `report-${visit.id}`
  return (
    <form
      className="grid gap-3 rounded-lg border border-primary-400 bg-white p-4"
      aria-labelledby={`${id}-title`}
      onSubmit={(e) => { e.preventDefault(); onSave({ report: f.report || null, client_feedback: f.client_feedback || null, client_comments: f.client_comments || null }) }}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 id={`${id}-title`} className="font-display text-[13px] font-bold">{t('report.title')}</h4>
        <IconAction icon={FiX} label={t('report.close')} onClick={onClose} tipAlign="end" className="-m-2" />
      </div>
      <label className="grid gap-1 text-sm font-medium text-gray-700">
        {t('report.report')}
        <textarea rows={3} value={f.report} onChange={set('report')} placeholder={t('report.reportPlaceholder')} className={ctrl} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
        <label className="grid content-start gap-1 text-sm font-medium text-gray-700">
          {t('report.feedback')}
          <select value={f.client_feedback} onChange={set('client_feedback')} className={ctrl}>
            <option value="">{t('report.feedbackNone')}</option>
            {FEEDBACKS.map((k) => <option key={k} value={k}>{t(`feedback.${k}`)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          {t('report.comments')}
          <textarea rows={2} value={f.client_comments} onChange={set('client_comments')} className={ctrl} />
        </label>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary-400 px-4 py-2 text-sm font-semibold text-[#241906] hover:bg-primary-600 disabled:opacity-60">
          {t('report.save')}
        </button>
      </div>
    </form>
  )
}

function Fiche({ visit, now, reporting, setReporting, onAction, saving, id }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtDate } = useFormat()
  const when = (iso) => fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' })
  const act = (kind) => (kind === 'complete' || kind === 'report' ? setReporting(true) : onAction(kind, visit))
  return (
    <div id={id} className="mb-3 grid gap-4 rounded-lg bg-gray-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Section title={t('fiche.property')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">{visit.property_title || t('noProperty')}</p>
              {visit.property_address && <p className="text-gray-500">{visit.property_address}</p>}
            </div>
            {visit.property_id && <IconAction icon={FiArrowUpRight} label={t('fiche.openProperty')} to={`/backoffice/biens/${visit.property_id}`} tone="gold" tipAlign="end" className="-m-1.5" />}
          </div>
        </Section>
        <Section title={t('fiche.contact')}>
          <div className="flex items-start justify-between gap-2">
            <div className="grid min-w-0 gap-0.5">
              <p className="font-semibold">{visit.contact_name || t('visitor')}</p>
              {visit.contact_phone && <a dir="ltr" href={`tel:${visit.contact_phone}`} className="justify-self-start text-primary-700 hover:underline">{visit.contact_phone}</a>}
              {visit.visitor_email && <a href={`mailto:${visit.visitor_email}`} className="truncate text-primary-700 hover:underline">{visit.visitor_email}</a>}
            </div>
            {visit.client_id && <IconAction icon={FiArrowUpRight} label={t('fiche.openClient')} to={`/backoffice/clients/${visit.client_id}`} tone="gold" tipAlign="end" className="-m-1.5" />}
          </div>
        </Section>
        <Section title={t('fiche.agent')}>
          <p className={visit.agent_name ? 'font-semibold' : 'text-gray-500'}>{visit.agent_name || t('fiche.noAgent')}</p>
          <p className="text-gray-500">{fmtDate(visit.scheduled_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · {t('row.duration', { minutes: visit.duration_minutes || 30 })}</p>
        </Section>
        <Section title={t('fiche.confirmation')}>
          <p className={visit.confirmed_at ? '' : 'text-gray-500'}>{visit.confirmed_at ? t('fiche.confirmedAt', { date: when(visit.confirmed_at) }) : t('fiche.notConfirmed')}</p>
          {visit.completed_at && <p>{t('fiche.completedAt', { date: when(visit.completed_at) })}</p>}
          {visit.cancelled_at && <p>{t('fiche.cancelledAt', { date: when(visit.cancelled_at) })}</p>}
        </Section>
      </div>

      {visit.notes && <Section title={t('fiche.notes')}><p className="whitespace-pre-line">{visit.notes}</p></Section>}

      {reporting ? (
        <ReportForm visit={visit} saving={saving} onClose={() => setReporting(false)} onSave={(data) => onAction('complete', visit, data).then((ok) => ok && setReporting(false))} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Section title={t('fiche.report')}>
            <p className={visit.report ? 'whitespace-pre-line' : 'text-gray-500'}>{visit.report || t('fiche.noReport')}</p>
          </Section>
          <Section title={t('fiche.feedback')}>
            {visit.client_feedback
              ? <span><Chip tone={FEEDBACK_TONE[visit.client_feedback] || 'neutral'}>{t(`feedback.${visit.client_feedback}`, { defaultValue: visit.client_feedback })}</Chip></span>
              : !visit.client_comments && <p className="text-gray-500">{t('fiche.noFeedback')}</p>}
            {visit.client_comments && <p className="whitespace-pre-line">{visit.client_comments}</p>}
          </Section>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-1 border-t border-gray-200 pt-3">
        {actionsFor(visit, now).map((kind, i, all) => (
          <IconAction
            key={kind}
            icon={ICONS[kind]}
            label={t(`actions.${kind}`)}
            onClick={() => act(kind)}
            tone={kind === 'delete' || kind === 'no_show' ? 'danger' : kind === 'confirm' || kind === 'complete' ? 'gold' : 'default'}
            tipAlign={i === all.length - 1 ? 'end' : 'center'}
            disabled={saving}
          />
        ))}
      </div>
    </div>
  )
}

/** Ligne d'agenda : heure, contact, bien, statut ; se déplie en fiche complète. */
export default function VisitRow({ visit, now, open, onToggle, onAction, saving, showDate = false, quick = false }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtDate, fmtTime } = useFormat()
  const [reporting, setReporting] = useState(false)
  const ficheId = `visit-fiche-${visit.id}`
  const toggle = () => { if (open) setReporting(false); onToggle() }
  const quickAct = (kind) => {
    if (kind !== 'complete') { onAction(kind, visit); return }
    setReporting(true)
    if (!open) onToggle()
  }

  return (
    <li className="border-t border-gray-100 first:border-t-0">
      <div className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2" onClick={toggle}>
        <span className="text-[13px] font-semibold tabular-nums text-gray-600">
          {showDate && <span className="block text-xs font-medium text-gray-500">{fmtDate(visit.scheduled_at, { day: 'numeric', month: 'short' })}</span>}
          {fmtTime(visit.scheduled_at)}
        </span>
        <span className="min-w-0">
          <span className="block truncate">
            <b className="font-semibold">{visit.contact_name || t('visitor')}</b>
            {visit.property_title && <span className="hidden text-[12.5px] text-gray-500 sm:inline"> · {visit.property_title}</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <StatusChip visit={visit} now={now} />
            {visit.agent_name && <span className="truncate">{visit.agent_name}</span>}
          </span>
        </span>
        <span className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {quick && QUICK.map((kind) => (
            <IconAction key={kind} icon={ICONS[kind]} label={t(`actions.${kind}`)} onClick={() => quickAct(kind)}
              tone={kind === 'no_show' ? 'danger' : kind === 'complete' ? 'gold' : 'default'} disabled={saving} />
          ))}
          <IconAction
            icon={FiChevronDown}
            label={open ? t('row.collapse') : t('row.expand')}
            onClick={toggle}
            tipAlign="end"
            aria-expanded={open}
            aria-controls={ficheId}
            className={`[&>svg]:transition-transform motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''}`}
          />
        </span>
      </div>
      {open && <Fiche id={ficheId} visit={visit} now={now} reporting={reporting} setReporting={setReporting} onAction={onAction} saving={saving} />}
    </li>
  )
}
