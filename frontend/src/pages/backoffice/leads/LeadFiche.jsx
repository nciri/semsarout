import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiArrowUpRight, FiMail, FiPhone, FiUsers } from 'react-icons/fi'
import api from '../../../services/api'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, IconAction } from '../components/kit'
import { STATUS_TONES, statusHistory } from './model'

const K = 'crm.pipeline.leads'
const fetchDuplicates = async (id) => (await api.get(`/backoffice/leads/${id}/duplicates`)).data

function Block({ title, children }) {
  return (
    <div className="grid content-start gap-1.5">
      <h4 className="font-display text-[13px] font-bold">{title}</h4>
      {children}
    </div>
  )
}

/** Fiche dépliée sous la ligne d'un lead : demande, historique, attribution, doublons. */
export default function LeadFiche({ lead, agents, onAssign }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const dup = useQuery(['backoffice-lead-duplicates', lead.id], () => fetchDuplicates(lead.id))
  const date = (iso) => fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' })
  const others = dup.data?.leads || []
  const clients = dup.data?.clients || []

  return (
    <DetailColumns
      main={
        <div className="grid gap-5 sm:grid-cols-2">
          <Block title={t(`${K}.detail.message`)}>
            <p className="whitespace-pre-wrap text-[13px] text-gray-700">{lead.message || t(`${K}.detail.noMessage`)}</p>
            {lead.notes && (
              <>
                <h5 className="mt-2 text-xs text-gray-500">{t(`${K}.detail.internalNotes`)}</h5>
                <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-2.5 text-[13px] text-gray-700">{lead.notes}</p>
              </>
            )}
          </Block>

          <Block title={t(`${K}.detail.property`)}>
            <div className="flex items-center gap-1 text-[13px]">
              <span className={lead.property_title ? 'font-semibold' : 'text-gray-500'}>
                {lead.property_title || t(`${K}.list.noProperty`)}
              </span>
              {lead.property_id && (
                <IconAction icon={FiArrowUpRight} label={t(`${K}.detail.openProperty`)} to={`/backoffice/biens/${lead.property_id}`} tone="gold" className="-my-2" />
              )}
            </div>
            <h5 className="mt-2 text-xs text-gray-500">{t(`${K}.detail.contactInfo`)}</h5>
            <div className="flex flex-wrap items-center gap-x-1 text-[13px]">
              {lead.email && <IconAction icon={FiMail} label={t(`${K}.detail.email`, { email: lead.email })} to={`mailto:${lead.email}`} />}
              {lead.phone && <IconAction icon={FiPhone} label={t(`${K}.detail.call`, { phone: lead.phone })} to={`tel:${lead.phone}`} />}
              <span dir="ltr" className="min-w-0 break-all text-gray-600">{[lead.email, lead.phone].filter(Boolean).join(' · ')}</span>
            </div>
          </Block>

          <Block title={t(`${K}.detail.history.title`)}>
            <ol className="grid gap-2 border-s-2 border-gray-100 ps-3 text-[13px]">
              {statusHistory(lead).map((s) => (
                <li key={s.key} className="relative">
                  <span aria-hidden="true" className={`absolute -start-[17px] top-1.5 h-2 w-2 rounded-full ${s.key === 'lost' ? 'bg-gray-400' : 'bg-primary-400'}`} />
                  <b className="font-semibold">{t(`${K}.detail.history.${s.key}`)}</b>
                  <span className="text-gray-500"> · {s.at ? date(s.at) : t(`${K}.detail.history.undated`)}</span>
                  {s.key === 'lost' && lead.lost_reason && <span className="block text-gray-600">{lead.lost_reason}</span>}
                </li>
              ))}
            </ol>
          </Block>

          <Block title={t(`${K}.detail.assignedTo`)}>
            <select
              aria-label={t(`${K}.detail.assignLabel`, { name: lead.name || t(`${K}.list.noName`) })}
              value={lead.assigned_to_id ?? ''}
              onChange={(e) => onAssign(lead, e.target.value ? Number(e.target.value) : null)}
              className="w-full max-w-xs rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px]"
            >
              <option value="">{t(`${K}.list.unassigned`)}</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
            </select>
          </Block>
        </div>
      }
      aside={
        <>
          <h4 className="flex items-center gap-2 font-display text-[13px] font-bold">
            <FiUsers className="h-4 w-4 text-gray-400" aria-hidden="true" />{t(`${K}.detail.duplicates.title`)}
          </h4>
          {dup.isLoading && <p className="text-[13px] text-gray-500">{t(`${K}.detail.duplicates.loading`)}</p>}
          {dup.isError && <p className="text-[13px] text-red-700">{t(`${K}.detail.duplicates.error`)}</p>}
          {dup.data && !others.length && !clients.length && <p className="text-[13px] text-gray-500">{t(`${K}.detail.duplicates.none`)}</p>}
          {others.length > 0 && (
            <Alert tone="warn" icon={FiUsers}>{t(`${K}.detail.duplicates.leadsAlert`, { count: others.length })}</Alert>
          )}
          {others.length > 0 && (
            <ul className="grid text-[13px]" aria-label={t(`${K}.detail.duplicates.leadsLabel`)}>
              {others.map((d) => (
                <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
                  <b className="truncate font-semibold">{d.name || t(`${K}.list.noName`)}</b>
                  <span className="row-span-2 self-center"><Chip tone={STATUS_TONES[d.status]}>{t(`${K}.status.${d.status}`, { defaultValue: d.status })}</Chip></span>
                  <span className="truncate text-[12.5px] text-gray-500">
                    {fmtDate(d.created_at, { day: 'numeric', month: 'short' })} · {d.property_title || t(`${K}.list.noProperty`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {clients.length > 0 && (
            <ul className="grid gap-1 text-[13px]" aria-label={t(`${K}.detail.duplicates.clientsLabel`)}>
              {clients.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                  <span className="min-w-0">
                    <b className="block truncate font-semibold">{c.name}</b>
                    <span className="text-[12.5px] text-gray-500">
                      {c.from_this_lead ? t(`${K}.detail.duplicates.fromThisLead`) : t(`${K}.detail.duplicates.existingClient`)}
                    </span>
                  </span>
                  <IconAction icon={FiArrowUpRight} label={t(`${K}.detail.duplicates.openClient`)} to={`/backoffice/clients/${c.id}`} tone="gold" tipAlign="end" />
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  )
}
