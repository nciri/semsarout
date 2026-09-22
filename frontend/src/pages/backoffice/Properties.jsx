import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import {
  FiChevronDown, FiChevronLeft, FiChevronRight, FiFileText, FiGrid, FiHome, FiImage, FiList, FiPlus,
  FiRefreshCw, FiSearch, FiStar, FiTag, FiZap,
} from 'react-icons/fi'
import api from '../../services/api'
import { useFormat } from '../../utils/format'
import { Alert, IconAction, Legend, SegBar, Segmented, Widget } from './components/kit'
import {
  PROPERTY_TYPES, SORT_KEYS, STATUSES, STATUS_COLORS, draftQueue, enrich, filterRows, overview, paginate,
  photoQueue, priceQueue, statusQueue,
} from './biens/model'
import {
  DraftCompact, DraftDetail, PhotosCompact, PhotosDetail, PriceCompact, PriceDetail, StatusCompact, StatusDetail,
} from './biens/QueueCards'
import PropertyDetail from './biens/PropertyDetail'
import { B, useDisclosure, useFullMoney, usePlacement } from './biens/hooks'
import { DetailPanel, ItemActions, SignalChips, StatusChip } from './biens/shared'

const fetchInsights = async () => (await api.get('/backoffice/properties/insights')).data
// Même clé et même requête que la sidebar et le tableau de bord : react-query partage la réponse.
const fetchDashboard = async () => (await api.get('/backoffice/dashboard')).data

const QUEUES = [
  { key: 'q:photos', icon: FiImage, title: 'photos.title' },
  { key: 'q:price', icon: FiTag, title: 'price.title' },
  { key: 'q:status', icon: FiRefreshCw, title: 'status.title' },
  { key: 'q:draft', icon: FiFileText, title: 'draft.title' },
]
const QUEUE_KEYS = QUEUES.map((x) => x.key)

const VIEW_STORE = 'biens-view'
function readView() {
  try { return localStorage.getItem(VIEW_STORE) === 'cards' ? 'cards' : 'rows' } catch { return 'rows' }
}

// Au-delà de 1360 px, une ligne tient toutes ses colonnes ; en deçà, la ligne se replie.
const ROW_COLS = 'grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3.5 py-3 min-[1360px]:grid-cols-[52px_minmax(0,2.3fr)_104px_128px_62px_70px_62px_minmax(0,1.5fr)_178px_34px] min-[1360px]:px-4 min-[1360px]:py-2.5'
const WIDE = 'hidden min-[1360px]:block'

function ExpandButton({ open, onClick, className = '' }) {
  const { t } = useTranslation('backoffice')
  return (
    <IconAction icon={FiChevronDown} label={open ? t('dashboard.collapse') : t('dashboard.expand')} onClick={onClick}
      tone="gold" tipAlign="end" aria-expanded={open} aria-controls="dashboard-detail"
      className={`[&>svg]:transition-transform [&>svg]:duration-200 motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''} ${className}`} />
  )
}

function Tags({ p }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.tags` })
  return (<>
    {p.is_featured && <span className="ms-1.5 inline-flex items-center gap-0.5 align-[1px] text-[11px] font-semibold text-primary-700"><FiStar className="h-3 w-3" aria-hidden="true" />{t('featured')}</span>}
    {p.is_urgent && <span className="ms-1.5 inline-flex items-center gap-0.5 align-[1px] text-[11px] font-semibold text-primary-700"><FiZap className="h-3 w-3" aria-hidden="true" />{t('urgent')}</span>}
  </>)
}

function Thumb({ p, className }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.list` })
  if (!p.images_count) {
    return <span role="img" aria-label={t('noPhoto')} className={`grid place-items-center bg-red-50 text-red-700 ${className}`}><FiImage className="h-4 w-4" aria-hidden="true" /></span>
  }
  return (
    <span className={`relative overflow-hidden bg-gray-100 ${className}`}>
      {p.cover_url && <img src={p.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
      <span className="absolute bottom-0.5 end-0.5 rounded bg-white/90 px-1 text-[10px] font-semibold leading-4 text-gray-700" aria-label={t('photos', { count: p.images_count })}>{p.images_count}</span>
    </span>
  )
}

function useLine() {
  const { t } = useTranslation('backoffice')
  return (p) => [p.reference, [p.city, p.neighborhood].filter(Boolean).join(', '),
    `${t(`crm.shared.propertyTypes.${p.property_type}`, { defaultValue: p.property_type })} · ${t(`crm.shared.listingTypes.${p.transaction_type}`, { defaultValue: p.transaction_type }).toLowerCase()}`,
  ].filter(Boolean).join(' · ')
}

function PropertyRow({ p, open, onToggle, onDelete, cardRef }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.list` })
  const { fmtNumber } = useFormat()
  const money = useFullMoney()
  const line = useLine()
  const sqm = p.surface && p.price != null ? money.sqm(p, p.price / p.surface) : '–'
  return (
    <div ref={cardRef} className={`${ROW_COLS} border-t border-gray-100 transition-colors motion-reduce:transition-none ${open ? 'bg-primary-50' : 'hover:bg-gray-50/60'}`}>
      <Thumb p={p} className="row-span-2 h-10 w-[52px] self-start rounded-md min-[1360px]:row-span-1 min-[1360px]:self-center" />
      <span className="min-w-0">
        <b className="block truncate font-semibold">{p.title}<Tags p={p} /></b>
        <span className="block truncate text-[12.5px] text-gray-500">{line(p)}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-gray-500 min-[1360px]:hidden">
          <StatusChip status={p.status} /><b className="font-semibold text-gray-900">{money(p)}</b>
          <span>{t('stats', { views: fmtNumber(p.views_count || 0), contacts: p.contacts_count || 0 })}</span>
        </span>
      </span>
      <span className={WIDE}><StatusChip status={p.status} /></span>
      <span className={`${WIDE} text-end`}>
        <b className="block whitespace-nowrap font-semibold tabular-nums">{money(p)}</b>
        <span className="block whitespace-nowrap text-xs text-gray-500">{sqm}</span>
      </span>
      <span className={`${WIDE} text-end tabular-nums`}>{fmtNumber(p.views_count || 0)}</span>
      <span className={`${WIDE} text-end tabular-nums`}>{p.contacts_count ? fmtNumber(p.contacts_count) : <span className="rounded-full bg-amber-50 px-2 text-xs font-semibold text-amber-700">0</span>}</span>
      <span className={`${WIDE} text-end tabular-nums`}>{p.upcoming || '–'}</span>
      <span className="col-span-2 col-start-2 min-w-0 min-[1360px]:col-span-1 min-[1360px]:col-start-auto"><SignalChips signals={p.signals} /></span>
      <ItemActions p={p} onDelete={onDelete} className="col-span-2 col-start-2 -ms-2 min-[1360px]:col-span-1 min-[1360px]:col-start-auto min-[1360px]:ms-0" />
      <ExpandButton open={open} onClick={onToggle} className="col-start-3 row-start-1 self-start min-[1360px]:col-start-auto min-[1360px]:row-start-auto min-[1360px]:self-center" />
    </div>
  )
}

function PropertyCard({ p, open, onToggle, onDelete, cardRef }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.list` })
  const { t: tb } = useTranslation('backoffice')
  const { fmtNumber } = useFormat()
  const money = useFullMoney()
  return (
    <article ref={cardRef} className={`grid grid-rows-[auto_1fr] overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${open ? 'border-primary-400 shadow-[0_0_0_3px] shadow-primary-50' : 'border-gray-200'}`}>
      <div className={`relative grid aspect-[16/6] place-items-center ${p.images_count ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-700'}`}>
        {p.cover_url && <img src={p.cover_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
        <span className="absolute start-2.5 top-2.5"><StatusChip status={p.status} /></span>
        <span className="relative inline-flex items-center gap-1.5 rounded bg-white/85 px-1.5 text-[12.5px] font-semibold">
          <FiImage className="h-4 w-4" aria-hidden="true" />{p.images_count ? t('photos', { count: p.images_count }) : t('noPhoto')}
        </span>
      </div>
      <div className="grid content-start gap-2.5 px-4 py-3.5">
        <div className="min-w-0">
          <b className="block truncate font-semibold">{p.title}<Tags p={p} /></b>
          <span className="block truncate text-[12.5px] text-gray-500">
            {[p.city, p.neighborhood].filter(Boolean).join(', ')} · {tb(`crm.shared.propertyTypes.${p.property_type}`, { defaultValue: p.property_type })}
          </span>
        </div>
        <div>
          <b className="block font-display text-lg font-extrabold tabular-nums">{money(p)}</b>
          <span className="block text-xs text-gray-500">{p.surface && p.price != null ? money.sqm(p, p.price / p.surface) : p.reference}</span>
        </div>
        <SignalChips signals={p.signals} />
        <div className="mt-auto flex gap-3 border-t border-gray-100 pt-2.5 text-[12.5px] tabular-nums text-gray-500">
          <span><b className="font-semibold text-gray-900">{fmtNumber(p.views_count || 0)}</b> {t('views', { count: p.views_count || 0 })}</span>
          <span><b className="font-semibold text-gray-900">{p.contacts_count || 0}</b> {t('contacts', { count: p.contacts_count || 0 })}</span>
          <span><b className="font-semibold text-gray-900">{p.upcoming}</b> {t('visits', { count: p.upcoming })}</span>
        </div>
        <div className="-mx-2 flex items-center justify-between">
          <ItemActions p={p} onDelete={onDelete} />
          <ExpandButton open={open} onClick={onToggle} />
        </div>
      </div>
    </article>
  )
}

function Overview({ ov }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.overview` })
  const { fmtNumber, fmtDate } = useFormat()
  const b = ov.buckets
  const kpis = [
    { label: t('online'), value: ov.online.total, sub: t('onlineSub', { sale: ov.online.sale, rent: ov.online.rent }) },
    { label: t('views'), value: fmtNumber(ov.online.views), sub: t('viewsSub', { count: ov.online.contacts, rate: fmtNumber(ov.online.rate * 100, { maximumFractionDigits: 1 }) }) },
    { label: t('visits'), value: ov.visits.count, sub: ov.visits.count ? t('visitsSub', { count: ov.visits.properties, date: fmtDate(ov.visits.last, { day: 'numeric', month: 'long' }) }) : t('visitsNone') },
    { label: t('leads'), value: ov.leads.count, sub: ov.leads.count ? t('leadsSub', { count: ov.leads.properties }) : t('leadsNone') },
  ]
  const parts = ['active', 'pending', 'draft', 'closed']
  return (
    <section aria-label={t('label')} className="grid gap-4 rounded-xl border border-gray-200 bg-white px-5 py-[18px]">
      <div className="-mx-5 grid grid-cols-2 gap-y-3 border-b border-gray-100 pb-3.5 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} className={`grid content-start gap-0.5 px-5 ${i % 2 === 0 ? 'border-e border-gray-200' : ''} ${i === 1 ? 'lg:border-e' : ''}`}>
            <span className="text-xs font-medium text-gray-500">{k.label}</span>
            <span className="font-display text-[22px] font-extrabold tabular-nums">{k.value}</span>
            <span className="text-xs text-gray-500">{k.sub}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-2">
        <SegBar label={t('barLabel', { total: ov.total, ...b })} parts={parts.map((k) => ({ value: b[k], color: STATUS_COLORS[k] }))} />
        <Legend items={parts.map((k) => ({ color: STATUS_COLORS[k], label: `${t(`buckets.${k}`)} ${b[k]}` }))} />
      </div>
    </section>
  )
}

export default function BackofficeProperties() {
  const { t } = useTranslation('backoffice')
  const tb = (k, o) => t(`${B}.${k}`, o)
  const queryClient = useQueryClient()
  const now = useMemo(() => new Date(), [])
  const insights = useQuery('backoffice-properties-insights', fetchInsights)
  const dash = useQuery('backoffice-dashboard', fetchDashboard, { refetchInterval: 60000 })
  const ctx = useMemo(() => ({
    newLeads: dash.data?.widgets?.new_leads || [], upcomingVisits: dash.data?.widgets?.upcoming_visits || [],
  }), [dash.data])
  const rows = useMemo(() => enrich(insights.data?.properties || [], ctx), [insights.data, ctx])
  const sources = insights.data?.sources || {}

  const [filters, setFilters] = useState({ q: '', status: '', type: '', sort: 'todo' })
  const [page, setPage] = useState(1)
  const [view, setView] = useState(readView)
  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); if (k !== 'sort') setPage(1) }
  const resetFilters = () => { setFilters((f) => ({ ...f, q: '', status: '', type: '' })); setPage(1) }
  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters])
  const pg = paginate(filtered, page)
  const filteredActive = Boolean(filters.q || filters.status || filters.type)

  const disc = useDisclosure()
  const queueGrid = useRef(null)
  const itemsBox = useRef(null)
  const itemKeys = pg.items.map((p) => `p:${p.id}`)
  const qPlace = usePlacement(disc, QUEUE_KEYS, queueGrid)
  const pPlace = usePlacement(disc, itemKeys, itemsBox)
  const openItem = disc.openKey?.startsWith('p:') ? rows.find((r) => `p:${r.id}` === disc.openKey) : null
  const itemSig = itemKeys.join(',')
  const { openKey, closeNow } = disc
  useEffect(() => {
    if (openKey?.startsWith('p:') && !itemSig.split(',').includes(openKey)) closeNow()
  }, [itemSig, openKey, closeNow])

  const invalidate = () => queryClient.invalidateQueries('backoffice-properties-insights')
  const deleteMutation = useMutation((id) => api.delete(`/backoffice/properties/${id}`), { onSuccess: invalidate })
  const statusMutation = useMutation(({ id, status }) => api.put(`/backoffice/properties/${id}`, { status }), {
    onSuccess: (_, { title, status }) => {
      toast.success(tb('toast.status', { title, status: t(`crm.properties.status.${status}`) }))
      invalidate()
    },
    onError: () => toast.error(tb('toast.error')),
  })
  const handleDelete = (p) => {
    if (window.confirm(t('crm.properties.list.confirmDelete', { title: p.title }))) deleteMutation.mutate(p.id)
  }
  const setStatus = (p, status) => statusMutation.mutate({ id: p.id, status, title: p.title })

  const ov = overview(rows, ctx)
  const q = { photos: photoQueue(rows), price: priceQueue(rows), status: statusQueue(rows), drafts: draftQueue(rows) }
  const counts = ov.counts
  const detailProps = { now, onClose: disc.close, titleRef: disc.titleRef }
  const QUEUE_BODY = {
    'q:photos': { compact: <PhotosCompact q={q.photos} />, detail: <PhotosDetail q={q.photos} {...detailProps} /> },
    'q:price': { compact: <PriceCompact q={q.price} available={sources.price_refs} />, detail: <PriceDetail q={q.price} available={sources.price_refs} {...detailProps} /> },
    'q:status': { compact: <StatusCompact rows={q.status} available={sources.transactions} />, detail: <StatusDetail rows={q.status} onFix={setStatus} fixing={statusMutation.isLoading} {...detailProps} /> },
    'q:draft': { compact: <DraftCompact drafts={q.drafts} now={now} />, detail: <DraftDetail drafts={q.drafts} onRepublish={(p) => setStatus(p, 'active')} republishing={statusMutation.isLoading} {...detailProps} /> },
  }

  const statusOptions = [
    { value: '', label: <>{tb('filters.all')}<span className="ms-1.5 tabular-nums text-gray-500">{rows.length}</span></> },
    ...STATUSES.map((s) => ({ value: s, label: <>{tb(`filters.status.${s}`)}<span className="ms-1.5 tabular-nums text-gray-500">{counts[s]}</span></> })),
  ]
  const selectCls = 'rounded-lg border border-gray-200 bg-white py-[7px] ps-3 pe-8 text-[13px] font-medium text-gray-900'

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('crm.properties.list.pageTitle')}</h1>
          <p className="mt-1 text-gray-500">{insights.data ? tb('subtitle', { count: rows.length }) : t('crm.properties.list.subtitle')}</p>
        </div>
        <IconAction icon={FiPlus} label={t('crm.properties.list.newButton')} to="/backoffice/biens/nouveau" tone="primary" tipAlign="end" />
      </div>

      {insights.isError && <Alert tone="crit">{tb('loadError')}</Alert>}
      {insights.isLoading && (
        <div aria-busy="true" aria-label={tb('loading')} className="grid gap-4">
          <div className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {QUEUES.map((x) => <div key={x.key} className="h-52 animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none" />)}
          </div>
        </div>
      )}

      {insights.data && rows.length === 0 && (
        <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center text-gray-500">
          <FiHome className="h-10 w-10 text-gray-300" aria-hidden="true" />
          <h2 className="font-display text-[15px] font-bold text-gray-900">{t('crm.properties.list.empty.title')}</h2>
          <p>{t('crm.properties.list.empty.default')}</p>
          <IconAction icon={FiPlus} label={t('crm.properties.list.addFirstButton')} to="/backoffice/biens/nouveau" tone="primary" />
        </div>
      )}

      {rows.length > 0 && (<>
        <Overview ov={ov} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold tracking-tight">{tb('queue.title')}</h2>
          <p className="text-[13px] text-gray-500">{tb('queue.sub')}</p>
        </div>
        <div ref={queueGrid} className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {QUEUES.map((x) => [
            <Widget key={x.key} id={x.key.slice(2)} title={tb(x.title, x.key === 'q:draft' ? { count: q.drafts.length } : undefined)} icon={x.icon}
              open={disc.openKey === x.key} onToggle={() => disc.toggle(x.key)} cardRef={disc.cardRef(x.key)}>
              {QUEUE_BODY[x.key].compact}
            </Widget>,
            qPlace?.after === x.key ? (
              <DetailPanel key="detail" shown={disc.shown} notch={qPlace.notch}>{QUEUE_BODY[disc.openKey].detail}</DetailPanel>
            ) : null,
          ])}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold tracking-tight">{tb('list.title')}</h2>
          <p className="text-[13px] text-gray-500">{filtered.length === rows.length ? tb('list.count', { count: rows.length }) : tb('list.countOf', { count: filtered.length, total: rows.length })}</p>
        </div>

        <div role="search" className="flex flex-wrap items-center gap-2.5">
          <label className="flex min-w-0 flex-[1_1_100%] items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-[7px] text-gray-500 focus-within:border-blue-600 sm:flex-[1_1_180px]">
            <FiSearch className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
            <input type="search" value={filters.q} onChange={(e) => setFilter('q', e.target.value)}
              placeholder={t('crm.properties.list.searchPlaceholder')} aria-label={tb('filters.search')}
              className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none focus:ring-0" />
          </label>
          <div className="hidden md:block">
            <Segmented label={t('crm.properties.list.filterStatusLabel')} value={filters.status} options={statusOptions} onChange={(v) => setFilter('status', v)} />
          </div>
          <select className={`${selectCls} md:hidden`} aria-label={t('crm.properties.list.filterStatusLabel')} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">{tb('filters.allCount', { count: rows.length })}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{`${tb(`filters.status.${s}`)} (${counts[s]})`}</option>)}
          </select>
          <select className={selectCls} aria-label={t('crm.properties.list.filterTypeLabel')} value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">{t('crm.properties.list.filterTypeAll')}</option>
            {PROPERTY_TYPES.map((k) => <option key={k} value={k}>{t(`crm.shared.propertyTypes.${k}`)}</option>)}
          </select>
          <select className={selectCls} aria-label={tb('filters.sort')} value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
            {SORT_KEYS.map((k) => <option key={k} value={k}>{tb(`filters.sorts.${k}`)}</option>)}
          </select>
          <div role="group" aria-label={tb('filters.view')} className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-[3px]">
            {[['rows', FiList], ['cards', FiGrid]].map(([v, icon]) => (
              <IconAction key={v} icon={icon} label={tb(`filters.views.${v}`)} aria-pressed={view === v} tipAlign="end"
                onClick={() => { setView(v); try { localStorage.setItem(VIEW_STORE, v) } catch { /* stockage indisponible */ } }}
                className={`!p-1.5 ${view === v ? 'bg-white text-gray-900 shadow-sm hover:bg-white' : ''}`} />
            ))}
          </div>
          {filteredActive && (
            <button type="button" onClick={resetFilters} className="rounded-md px-2 py-1.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50">
              {t('crm.properties.list.resetFilters')}
            </button>
          )}
        </div>

        {!pg.items.length ? (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-5 py-9 text-center text-gray-500">
            <FiHome className="h-6 w-6" aria-hidden="true" />
            <b className="font-display text-[15px] font-bold text-gray-900">{t('crm.properties.list.empty.title')}</b>
            <span>{t('crm.properties.list.empty.filtered')}</span>
            <button type="button" onClick={resetFilters} className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13.5px] font-semibold text-gray-900 hover:bg-gray-50">
              {t('crm.properties.list.resetFilters')}
            </button>
          </div>
        ) : (
          <div ref={itemsBox} className={view === 'rows'
            ? 'grid rounded-xl border border-gray-200 bg-white pb-1 [&>#dashboard-detail]:px-3 [&>#dashboard-detail]:pb-3'
            : 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'}>
            {view === 'rows' && (
              <div aria-hidden="true" className={`${ROW_COLS} hidden pb-2 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500 min-[1360px]:grid`}>
                <span />
                <span>{tb('columns.property')}</span>
                <span>{tb('columns.status')}</span>
                <span className="text-end">{tb('columns.price')}</span>
                <span className="text-end">{tb('columns.views')}</span>
                <span className="text-end">{tb('columns.contacts')}</span>
                <span className="text-end">{tb('columns.visits')}</span>
                <span>{tb('columns.todo')}</span>
                <span /><span />
              </div>
            )}
            {pg.items.map((p) => {
              const key = `p:${p.id}`
              const Item = view === 'rows' ? PropertyRow : PropertyCard
              return (
                <Fragment key={key}>
                  <Item p={p} open={disc.openKey === key} onToggle={() => disc.toggle(key)} onDelete={handleDelete} cardRef={disc.cardRef(key)} />
                  {pPlace?.after === key && openItem && (
                    <DetailPanel shown={disc.shown} notch={pPlace.notch}><PropertyDetail p={openItem} {...detailProps} /></DetailPanel>
                  )}
                </Fragment>
              )
            })}
          </div>
        )}

        {pg.pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[13px] text-gray-500">{tb('pager.range', { from: pg.from + 1, to: pg.from + pg.items.length, total: filtered.length })}</span>
            <span className="flex items-center gap-2">
              <IconAction icon={FiChevronLeft} label={t('crm.properties.list.previous')} onClick={() => setPage(pg.page - 1)} disabled={pg.page === 1}
                className="border border-gray-200 bg-white disabled:opacity-45 rtl:[&>svg]:rotate-180" />
              <span className="text-[13px] text-gray-500">{t('crm.properties.list.pageOf', { page: pg.page, pages: pg.pages })}</span>
              <IconAction icon={FiChevronRight} label={t('crm.properties.list.next')} onClick={() => setPage(pg.page + 1)} disabled={pg.page === pg.pages}
                tipAlign="end" className="border border-gray-200 bg-white disabled:opacity-45 rtl:[&>svg]:rotate-180" />
            </span>
          </div>
        )}
      </>)}
    </div>
  )
}
