import { useTranslation } from 'react-i18next'
import {
  FiAlertCircle, FiAlertTriangle, FiClock, FiEdit2, FiHome, FiMail, FiPhone, FiPlus, FiTrash2, FiUserX, FiUsers,
} from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { transactionTypeForClient } from '../../../utils/clients'
import { Alert, Chip, DetailColumns, IconAction, Legend, Rich, TD, TH } from '../components/kit'
import { useMoney } from '../components/kitTokens'
import Frise, { ShapesLegend } from './Frise'
import { P, useBudget, useClientLabels } from './labels'
import { daysBetween, ficheAlerts, LANES, maskEmail, maskPhone, timelineOf } from './model'

const VISIT_TONE = { scheduled: 'warn', confirmed: 'good', completed: 'good', cancelled: 'neutral', no_show: 'crit' }
const LEAD_TONE = { new: 'crit', contacted: 'warn', qualified: 'good', converted: 'good', lost: 'neutral' }
const TX_TONE = { won: 'good', lost: 'crit', active: 'gold' }
const ALERT_ICON = {
  txNever: FiAlertCircle, txLate: FiAlertCircle, never: FiClock, late: FiClock, staleLead: FiMail, hotNoOffer: FiHome,
  inactiveTx: FiAlertTriangle, inactiveVisit: FiAlertTriangle, duplicate: FiUsers, badBudget: FiAlertTriangle, noAgent: FiUserX,
}

/** Actions d'un client, en icônes : modifier, nouvelle vente ou location, supprimer. */
export function FicheActions({ client, onDelete }) {
  const { t } = useTranslation('backoffice')
  const txType = transactionTypeForClient(client.client_type)
  return (
    <>
      <IconAction icon={FiEdit2} label={t(`${P}.actions.edit`)} to={`/backoffice/clients/${client.id}/modifier`} />
      <IconAction
        icon={FiPlus}
        tone="primary"
        label={t(`${P}.actions.newTx.${txType}`)}
        to={`/backoffice/transactions/nouveau?client_id=${client.id}&type=${txType}`}
      />
      <IconAction icon={FiTrash2} tone="danger" tipAlign="end" label={t(`${P}.actions.delete`)} onClick={() => onDelete(client)} />
    </>
  )
}

function useDescribe() {
  const { t } = useTranslation('backoffice')
  const { fmtTime } = useFormat()
  const money = useMoney()
  return (e) => {
    const x = e.data
    if (e.lane === 'lead') {
      return { title: t(`${P}.events.lead`, { source: t(`dashboard.sources.${x.source}`, { defaultValue: x.source || '' }) }),
        detail: x.property_title || '', chip: t(`${P}.leadStatus.${x.status}`, { defaultValue: x.status }), tone: LEAD_TONE[x.status] }
    }
    if (e.lane === 'inter') {
      const kind = t(`${P}.interactionTypes.${x.interaction_type}`, { defaultValue: x.interaction_type || '' })
      return { title: x.direction ? `${kind} ${t(`${P}.direction.${x.direction}`, { defaultValue: '' })}`.trim() : kind,
        detail: [x.subject, x.created_by_name].filter(Boolean).join(' · ') }
    }
    if (e.lane === 'visit') {
      return { title: t(`${P}.events.visit`, { property: x.property_title || '' }),
        detail: [fmtTime(x.scheduled_at), x.client_feedback && t(`${P}.feedback.${x.client_feedback}`, { defaultValue: x.client_feedback }).toLowerCase(), x.agent_name].filter(Boolean).join(' · '),
        chip: t(`dashboard.visits.status.${x.status}`, { defaultValue: x.status }), tone: VISIT_TONE[x.status] }
    }
    const amount = x.final_price || x.offer_price || x.asking_price || 0
    return {
      title: t(`${P}.events.tx.${x.transaction_type === 'rent' ? 'rent' : 'sale'}`, { property: x.property_title || '' }),
      detail: [t(`dashboard.stages.${x.stage}`, { defaultValue: x.stage || '' }), money(amount, x.transaction_type),
        x.status === 'active' && x.probability != null ? `${x.probability} %` : null, x.lost_reason].filter(Boolean).join(' · '),
      chip: t(`${P}.txStatus.${x.status}`, { defaultValue: x.status }), tone: TX_TONE[x.status],
    }
  }
}

function FicheAlert({ a, d, now }) {
  const { fmtDate } = useFormat()
  const budget = useBudget()
  const { type } = useClientLabels()
  const long = (iso) => fmtDate(iso, { day: 'numeric', month: 'long' })
  const values = {
    txNever: { count: a.count }, txLate: { count: a.count, days: d.age },
    never: {}, late: { days: d.age, date: d.last && long(d.last) },
    staleLead: a.lead && { date: long(a.lead.created_at), days: daysBetween(new Date(a.lead.created_at), now), property: a.lead.property_title || '' },
    hotNoOffer: a.visit && { property: a.visit.property_title || '', date: long(a.visit.scheduled_at) },
    inactiveTx: { count: a.count }, inactiveVisit: a.visit && { date: long(a.visit.scheduled_at) },
    duplicate: a.other && { name: a.other.name, type: type(a.other.client_type).toLowerCase(), city: a.other.city || '' },
    badBudget: { budget: budget(d.client) }, noAgent: {},
  }[a.key]
  return (
    <Alert tone={a.tone} icon={ALERT_ICON[a.key]}>
      <Rich i18nKey={`${P}.alerts.${a.key}`} values={values} />
      {a.revisit && <> <Rich i18nKey={`${P}.alerts.revisit`} values={{ date: long(a.revisit.scheduled_at) }} /></>}
    </Alert>
  )
}

function ContactLine({ label, value }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-medium tabular-nums [overflow-wrap:anywhere]">{value || '—'}</span>
    </div>
  )
}

/**
 * Contenu d'une fiche client : frise et journal à gauche, constats et coordonnées à droite.
 * `masked` : dans la liste, téléphone et e-mail sont partiellement masqués (écran partagé,
 * captures) ; la fiche complète les montre en entier.
 */
export default function ClientFiche({ d, history, transactions, others, masked = false, now }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const budget = useBudget()
  const describe = useDescribe()
  const c = d.client
  const events = timelineOf(history, transactions)
  // Doublons : ceux de l'historique (fiche complète) ou ceux de la synthèse (liste).
  const dupOthers = new Map([...(others || new Map())])
  for (const x of history?.duplicates || []) if (!dupOthers.has(x.id)) dupOthers.set(x.id, x)
  const alerts = ficheAlerts({ ...d, duplicates: [...new Set([...d.duplicates, ...(history?.duplicates || []).map((x) => x.id)])] }, dupOthers)
  const types = c.search_criteria?.property_types || []
  const locs = c.search_criteria?.locations || []
  const phone = masked ? maskPhone(c.phone) : c.phone
  const email = masked ? maskEmail(c.email) : c.email
  const h3 = 'font-display text-[13px] font-bold'

  return (
    <DetailColumns
      main={<>
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
          <h3 className="font-display text-[13.5px] font-bold">{t(`${P}.historyTitle`)}</h3>
          <Legend items={LANES.map((l) => ({ color: l.color, label: t(`${P}.lanes.${l.key}`) }))} />
        </div>
        {!events.length ? (
          <Alert tone="plain" icon={FiClock}>{t(`${P}.noHistory`)}</Alert>
        ) : <>
          <Frise events={events} now={now} describe={describe} label={t(`${P}.friseLabel`, { name: d.name })} />
          <ShapesLegend />
          <table className="mt-3.5 w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={TH}>{t(`${P}.cols.date`)}</th>
                <th className={`${TH} max-sm:hidden`}>{t(`${P}.cols.type`)}</th>
                <th className={TH}>{t(`${P}.cols.detail`)}</th>
                <th className={`${TH} text-end`}>{t(`${P}.cols.outcome`)}</th>
              </tr>
            </thead>
            <tbody>
              {[...events].reverse().map((e, i) => {
                const x = describe(e)
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(e.date, { day: 'numeric', month: 'short' })}</td>
                    <td className={`${TD} whitespace-nowrap max-sm:hidden`}>
                      <span className="me-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: LANES.find((l) => l.key === e.lane).color }} />
                      {t(`${P}.lanes.${e.lane}`)}
                    </td>
                    <td className={TD}>
                      <b className="font-semibold">{x.title}</b>
                      {x.detail && <span className="block text-xs text-gray-500">{x.detail}</span>}
                    </td>
                    <td className={`${TD} text-end`}>{x.chip && <Chip tone={x.tone}>{x.chip}</Chip>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>}
      </>}
      aside={<>
        {alerts.map((a, i) => <FicheAlert key={i} a={a} d={d} now={now} />)}
        <h3 className={h3}>{t(`${P}.contact`)}</h3>
        <div className="grid grid-cols-2 gap-3">
          <ContactLine label={t('crm.clients.detail.fields.phonePrimary')} value={phone} />
          <ContactLine label={t('crm.clients.detail.fields.email')} value={email} />
          {!masked && c.phone_secondary && <ContactLine label={t('crm.clients.detail.fields.phoneSecondary')} value={c.phone_secondary} />}
          {!masked && c.address && <ContactLine label={t('crm.clients.detail.fields.address')} value={c.address} />}
        </div>
        {(c.phone || c.email) && (
          <div className="flex gap-1.5">
            {c.phone && <IconAction icon={FiPhone} label={t(`${P}.actions.call`)} className="border border-gray-200 bg-white" onClick={() => { window.location.href = `tel:${c.phone.replace(/\s/g, '')}` }} />}
            {c.email && <IconAction icon={FiMail} label={t(`${P}.actions.write`)} className="border border-gray-200 bg-white" onClick={() => { window.location.href = `mailto:${c.email}` }} />}
          </div>
        )}
        {(budget(c) || types.length > 0 || locs.length > 0) && <>
          <h3 className={h3}>{t(`${P}.search`)}</h3>
          <div className="grid grid-cols-2 gap-3">
            {budget(c) && <ContactLine label={t(`${P}.budget`)} value={budget(c)} />}
            {types.length > 0 && <ContactLine label={t('crm.clients.detail.propertyTypesWanted')} value={types.map((x) => t(`crm.shared.propertyTypes.${x}`, { defaultValue: x }).toLowerCase()).join(', ')} />}
            {locs.length > 0 && <ContactLine label={t('crm.clients.detail.preferredCities')} value={locs.join(', ')} />}
          </div>
        </>}
        {c.tags?.length > 0 && <>
          <h3 className={h3}>{t('crm.clients.detail.fields.tags')}</h3>
          <div className="flex flex-wrap gap-1.5">{c.tags.map((x) => <Chip key={x}>{x}</Chip>)}</div>
        </>}
        {c.notes && <>
          <h3 className={h3}>{t('crm.clients.detail.fields.notes')}</h3>
          <p className="whitespace-pre-wrap text-[13px] text-gray-500">{c.notes}</p>
        </>}
      </>}
    />
  )
}
