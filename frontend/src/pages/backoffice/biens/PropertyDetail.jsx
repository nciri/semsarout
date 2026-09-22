import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiEdit2, FiExternalLink, FiFilePlus, FiImage, FiMail, FiTag } from 'react-icons/fi'
import api from '../../../services/api'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, IconAction, Rich } from '../components/kit'
import { splitVisits } from './model'
import { RangeAxis, RangeLegend, RangeRow } from './PriceRange'
import { B, useFullMoney, useStatusWhat } from './hooks'
import { KpiStrip, ListingChecks } from './shared'

const LEAD_TONE = { new: 'warn', contacted: 'neutral', qualified: 'good', converted: 'good', lost: 'crit' }
const VISIT_TONE = { scheduled: 'warn', confirmed: 'good', completed: 'good', cancelled: 'neutral', no_show: 'crit' }
const TX_TONE = { active: 'neutral', won: 'good', lost: 'crit' }

// Chargés à l'ouverture seulement : la liste n'en a pas besoin, le détail si.
const fetchLeads = async (id) => (await api.get('/backoffice/leads', { params: { property_id: id, per_page: 50 } })).data.leads || []
const fetchVisits = async (id) => (await api.get('/backoffice/visits', { params: { property_id: id, per_page: 50 } })).data.visits || []

function Events({ title, items, empty }) {
  return (
    <>
      <h3 className="font-display text-[13px] font-bold">{title}</h3>
      {items === null ? <p className="text-[12.5px] text-gray-500">…</p> : items.length ? (
        <ul className="grid">
          {items.map((it) => (
            <li key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-px border-t border-gray-100 py-1.5 text-[13px] first:border-t-0 first:pt-0">
              <b className="truncate font-semibold">{it.title}</b>
              <span className="col-start-1 text-xs text-gray-500">{it.sub}</span>
              <span className="col-start-2 row-span-2 row-start-1 self-center">{it.end}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12.5px] text-gray-500">{empty}</p>}
    </>
  )
}

export default function PropertyDetail({ p, now, onClose, titleRef }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.detail` })
  const { t: tb } = useTranslation('backoffice')
  const { fmtNumber, fmtDate, fmtTime } = useFormat()
  const money = useFullMoney()
  const what = useStatusWhat()
  const leads = useQuery(['backoffice-property-leads', p.id], () => fetchLeads(p.id), { staleTime: 60000 })
  const visits = useQuery(['backoffice-property-visits', p.id], () => fetchVisits(p.id), { staleTime: 60000 })
  const v = visits.data ? splitVisits(visits.data, now) : null
  const rate = p.views_count ? (p.contacts_count || 0) / p.views_count : null
  const kind = `${tb(`crm.shared.propertyTypes.${p.property_type}`, { defaultValue: p.property_type })} · ${tb(`crm.shared.listingTypes.${p.transaction_type}`, { defaultValue: p.transaction_type })}`
  const tx = `/backoffice/transactions/nouveau?property_id=${p.id}&type=${p.transaction_type === 'rent' ? 'rent' : 'sale'}`
  const range = p.market && { min: fmtNumber(p.market.ref.min), max: fmtNumber(p.market.ref.max) }
  const online = p.status === 'active'

  return (
    <DetailFrame
      title={p.title}
      sub={[p.reference, [p.city, p.neighborhood].filter(Boolean).join(', '), kind, tb(`crm.properties.status.${p.status}`, { defaultValue: p.status })].filter(Boolean).join(' · ')}
      controls={<>
        <IconAction icon={FiExternalLink} label={tb('crm.properties.list.viewOnline')} to={`/annonces/${p.id}`} target="_blank" rel="noopener noreferrer" tone="gold" />
        <IconAction icon={FiEdit2} label={tb('crm.properties.list.edit')} to={`/backoffice/biens/${p.id}`} tone="gold" />
        <IconAction icon={FiFilePlus} label={tb('crm.properties.list.newTransaction')} to={tx} tone="gold" />
      </>}
      onClose={onClose}
      titleRef={titleRef}
    >
      <DetailColumns
        main={<div className="grid content-start gap-5">
          <KpiStrip items={[
            { label: t('price'), value: p.price != null ? fmtNumber(Math.round(p.price)) : '—', unit: money.unit(p), sub: p.surface && p.price != null ? money.sqm(p, p.price / p.surface) : t('noSurface') },
            { label: t('views'), value: fmtNumber(p.views_count || 0), sub: t('favorites', { count: p.favorites_count || 0 }) },
            { label: t('contacts'), value: fmtNumber(p.contacts_count || 0), sub: rate == null ? '–' : t('rate', { rate: fmtNumber(rate * 100, { maximumFractionDigits: 1 }) }) },
            { label: t('visits'), value: v ? v.upcoming.length : '…', unit: t('upcomingUnit'), sub: v && (v.past ? t('completedOf', { done: v.completed, count: v.past }) : t('noPast')) },
          ]} />
          {p.market && (
            <div className="grid content-start gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-[13px] font-bold">{t('priceTitle', { neighborhood: p.neighborhood })}</h3>
                <RangeLegend />
              </div>
              <RangeAxis name="" />
              <RangeRow row={p} name={t('thisOne')} />
            </div>
          )}
          <ListingChecks p={p} />
        </div>}
        aside={<>
          {p.status_check && (
            <Alert tone={p.status_check.tone} icon={FiAlertCircle}>
              <strong className="font-semibold">{t('statusAlert', { fix: tb(`${B}.status.fix.${p.status_check.expected}`) })}</strong> {what(p)}
            </Alert>
          )}
          {online && !p.images_count && <Alert tone="warn" icon={FiImage}><Rich i18nKey={`${B}.detail.noPhotoAlert`} /></Alert>}
          {online && p.market?.pos === 'above' && <Alert tone="crit" icon={FiTag}><Rich i18nKey={`${B}.detail.aboveAlert`} values={range} /></Alert>}
          {online && p.market?.pos === 'below' && <Alert tone="warn" icon={FiTag}><Rich i18nKey={`${B}.detail.belowAlert`} values={range} /></Alert>}
          {p.contacts_count > 0 && leads.data?.length === 0 && (
            <Alert tone="plain" icon={FiMail}>{t('unrecordedAlert', { count: p.contacts_count })}</Alert>
          )}
          <Events
            title={t('leadsTitle', { count: leads.data?.length ?? 0 })}
            empty={leads.isError ? t('loadError') : t('noLeads')}
            items={leads.data ? leads.data.map((l) => ({
              key: l.id, title: l.name,
              sub: `${tb(`dashboard.sources.${l.source}`, { defaultValue: l.source || tb('dashboard.sources.other') })} · ${fmtDate(l.created_at, { day: 'numeric', month: 'short' })}`,
              end: <Chip tone={LEAD_TONE[l.status] || 'neutral'}>{t(`leadStatus.${l.status}`, { defaultValue: l.status })}</Chip>,
            })) : leads.isError ? [] : null}
          />
          <Events
            title={t('visitsTitle', { count: v?.upcoming.length ?? 0 })}
            empty={visits.isError ? t('loadError') : t('noVisits')}
            items={v ? v.upcoming.map((x) => ({
              key: x.id, title: x.contact_name || '—',
              sub: `${fmtDate(x.scheduled_at, { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmtTime(x.scheduled_at)}`,
              end: <Chip tone={VISIT_TONE[x.status] || 'neutral'}>{t(`visitStatus.${x.status}`, { defaultValue: x.status })}</Chip>,
            })) : visits.isError ? [] : null}
          />
          <Events
            title={t('dealsTitle', { count: (p.transactions || []).length })}
            empty={t('noDeals')}
            items={(p.transactions || []).map((d, i) => ({
              key: d.id ?? i,
              title: `${tb(`dashboard.stages.${d.stage}`, { defaultValue: d.stage })}${d.amount != null ? ` · ${fmtNumber(Math.round(d.amount))} ${tb(`${B}.units.dh`)}` : ''}`,
              sub: d.status === 'active' ? t('probability', { value: d.probability ?? 0 })
                : d.closed_at ? t('closedOn', { date: fmtDate(d.closed_at, { day: 'numeric', month: 'long' }) }) : '',
              end: <Chip tone={TX_TONE[d.status] || 'neutral'}>{t(`dealStatus.${d.status}`, { defaultValue: d.status })}</Chip>,
            }))}
          />
        </>}
      />
    </DetailFrame>
  )
}
