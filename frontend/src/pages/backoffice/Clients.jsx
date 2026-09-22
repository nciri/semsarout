import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCalendar, FiChevronDown, FiClock, FiEye, FiSearch, FiUserPlus, FiUsers } from 'react-icons/fi'
import api from '../../services/api'
import { Alert, DetailFrame, IconAction, Widget } from './components/kit'
import ClientFiche, { FicheActions } from './clients/ClientFiche'
import { FixesCompact, FixesDetail, OffersCompact, OffersDetail, RelancesCompact, RelancesDetail } from './clients/Summary'
import { AgeChip, Flag, StatusChip } from './clients/ui'
import { P, useClientLabels, useCurrent, useFicheSub } from './clients/labels'
import {
  budgetMatches, buildDossiers, byUrgency, CLIENT_STATUSES, CLIENT_TYPES, EMPTY_FILTERS, fixes, flagOf,
  hotProperties, matches, STAGES, visitsWithoutOffer,
} from './clients/model'
import { useFormat } from '../../utils/format'

const get = async (url) => (await api.get(url)).data

const STORE_OPEN = 'clients-open'
const STORE_FILTERS = 'clients-filters'
const FIRST = 'first'

// Au premier passage, la fiche du client le plus urgent est ouverte pour montrer le mécanisme ;
// ensuite on retrouve l'état laissé par l'agent (y compris « tout replié », chaîne vide).
function readOpen() {
  try { const s = localStorage.getItem(STORE_OPEN); return s === null ? FIRST : s || null } catch { return FIRST }
}
function writeOpen(key) { try { localStorage.setItem(STORE_OPEN, key || '') } catch { /* stockage indisponible */ } }
function readFilters() {
  try { return { ...EMPTY_FILTERS, ...JSON.parse(localStorage.getItem(STORE_FILTERS) || '{}') } } catch { return EMPTY_FILTERS }
}

const WIDGETS = [
  { key: 'relances', icon: FiClock },
  { key: 'offers', icon: FiEye },
  { key: 'fixes', icon: FiAlertTriangle },
]

// Grille des lignes : sur mobile, nom et action en tête, statut et dernier échange dessous,
// « en cours » sur toute la largeur ; en tableau à partir de md, l'agent à partir de xl.
const ROW = 'grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,.9fr)_minmax(0,1.5fr)_minmax(0,.9fr)_48px] md:gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,.9fr)_48px]'
const CELL = 'md:col-auto md:row-auto'

function StageFilter({ label, value, options, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] ${value === o.value ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-600'}`}
        >
          {o.label}<span className="ms-1 tabular-nums text-gray-500">{o.count}</span>
        </button>
      ))}
    </div>
  )
}

/** Région dépliable sous une rangée de cartes ou sous une ligne, avec son repère. */
function DetailShell({ shown, notch, children }) {
  return (
    <div
      id="dashboard-detail"
      role="region"
      aria-labelledby="dashboard-detail-title"
      className="col-span-full grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: shown ? '1fr' : '0fr' }}
    >
      <div className="min-h-0 overflow-hidden py-2.5">
        <div className="relative rounded-xl border border-primary-400 bg-white shadow-[0_1px_2px_rgba(11,18,32,.04),0_14px_30px_-20px_rgba(11,18,32,.25)]">
          <span aria-hidden="true" className="absolute -top-[8px] h-3.5 w-3.5 -ms-[7px] rotate-45 border-s border-t border-primary-400 bg-white" style={{ insetInlineStart: notch }} />
          {children}
        </div>
      </div>
    </div>
  )
}

function ClientDetailView({ d, others, now, onClose, onDelete, titleRef }) {
  const { t } = useTranslation('backoffice')
  const sub = useFicheSub()
  const { data: history } = useQuery(['backoffice-client-history', d.id], () => get(`/backoffice/clients/${d.id}/history`), { retry: false })
  return (
    <DetailFrame
      title={d.name}
      sub={sub(d.client)}
      controls={<FicheActions client={d.client} onDelete={onDelete} />}
      link={{ to: `/backoffice/clients/${d.id}`, label: t(`${P}.actions.fullFiche`) }}
      onClose={onClose}
      titleRef={titleRef}
    >
      <ClientFiche d={d} history={history} transactions={d.tx} others={others} now={now} masked />
    </DetailFrame>
  )
}

export default function BackofficeClients() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const { type: typeLabel } = useClientLabels()
  const current = useCurrent()
  const now = useMemo(() => new Date(), [])

  const clientsQ = useQuery('backoffice-clients-all', () => get('/backoffice/clients?per_page=1000'))
  const summaryQ = useQuery('backoffice-clients-summary', () => get('/backoffice/clients/summary'), { retry: false })
  const txQ = useQuery('backoffice-clients-tx', () => get('/backoffice/transactions?per_page=1000'), { retry: false })
  const propsQ = useQuery('backoffice-clients-properties', () => get('/backoffice/properties?status=active&per_page=500'), { retry: false })

  const dossiers = useMemo(() => buildDossiers({
    clients: clientsQ.data?.clients || [], summary: summaryQ.data, transactions: txQ.data?.transactions || [], now,
  }), [clientsQ.data, summaryQ.data, txQ.data, now])
  const others = useMemo(() => new Map(dossiers.map((d) => [d.id, { name: d.name, client_type: d.client.client_type, city: d.client.city }])), [dossiers])

  const [filters, setFilters] = useState(readFilters)
  useEffect(() => { try { localStorage.setItem(STORE_FILTERS, JSON.stringify(filters)) } catch { /* stockage indisponible */ } }, [filters])
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }))
  const base = dossiers.filter((d) => matches(d, filters, typeLabel, true))
  const rows = base.filter((d) => matches(d, filters, typeLabel)).sort(byUrgency)
  const filtered = filters.q || filters.type || filters.status || filters.stage !== 'all'

  const offerRows = visitsWithoutOffer(dossiers)
  const match = budgetMatches(dossiers, propsQ.data?.properties || [])
  const fix = fixes(dossiers)
  const agents = new Set(dossiers.map((d) => d.client.assigned_to_id).filter(Boolean)).size

  const deleteMutation = useMutation((id) => api.delete(`/backoffice/clients/${id}`), {
    onSuccess: () => { qc.invalidateQueries('backoffice-clients-all'); qc.invalidateQueries('backoffice-clients-summary') },
  })
  const handleDelete = (client) => {
    if (window.confirm(t(`${P}.confirmDelete`, { name: `${client.first_name || ''} ${client.last_name || ''}`.trim() }))) deleteMutation.mutate(client.id)
  }

  /* ---- Divulgation progressive : un seul détail ouvert, carte de synthèse ou client. ---- */
  const [openKey, setOpenKey] = useState(readOpen)
  const [shown, setShown] = useState(false)
  const [place, setPlace] = useState({ after: null, notch: 0 })
  const [tick, setTick] = useState(0)
  const gridRef = useRef(null)
  const anchors = useRef({})
  const titleRef = useRef(null)
  const focusTitle = useRef(false)
  const closeTimer = useRef(null)

  useEffect(() => {
    if (openKey === FIRST && rows.length) setOpenKey(`c:${rows[0].id}`)
  }, [openKey, rows])

  const close = useCallback(() => {
    if (!openKey || openKey === FIRST) return
    const k = openKey
    setShown(false)
    writeOpen(null)
    closeTimer.current = setTimeout(() => setOpenKey(null), 240)
    anchors.current[k]?.querySelector?.('[aria-expanded]')?.focus({ preventScroll: true })
  }, [openKey])

  const open = (key) => {
    clearTimeout(closeTimer.current)
    focusTitle.current = true
    setShown(false)
    setOpenKey(key)
    writeOpen(key)
  }
  const toggle = (key) => (key === openKey ? close() : open(key))
  const openClient = (id) => {
    if (!rows.some((d) => d.id === id)) setFilters(EMPTY_FILTERS)
    open(`c:${id}`)
  }

  const isWidget = openKey?.startsWith('w:')
  // Le détail d'une carte se place après la DERNIÈRE carte de sa rangée ; celui d'un client,
  // juste sous sa ligne. Le repère pointe la carte, ou le bouton de la ligne.
  useLayoutEffect(() => {
    if (!openKey || openKey === FIRST) return
    const anchor = anchors.current[openKey]
    const box = isWidget ? gridRef.current : anchor
    if (!anchor || !box) return
    let after = openKey
    if (isWidget) {
      const row = WIDGETS.map((w) => anchors.current[`w:${w.key}`]).filter((el) => el && el.offsetTop === anchor.offsetTop)
      after = `w:${WIDGETS.find((w) => anchors.current[`w:${w.key}`] === row.at(-1))?.key}`
    }
    const target = isWidget ? anchor : anchor.querySelector('[aria-expanded]') || anchor
    const g = box.getBoundingClientRect()
    const c = target.getBoundingClientRect()
    const rtl = getComputedStyle(box).direction === 'rtl'
    const notch = (rtl ? g.right - c.right : c.left - g.left) + c.width / 2
    setPlace((p) => (p.after === after && Math.abs(p.notch - notch) < 1 ? p : { after, notch }))
  }, [openKey, isWidget, tick, dossiers, filters])

  useEffect(() => {
    const onResize = () => setTick((n) => n + 1)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!openKey || openKey === FIRST) return undefined
    const id = requestAnimationFrame(() => {
      setShown(true)
      if (focusTitle.current) {
        focusTitle.current = false
        titleRef.current?.focus({ preventScroll: true })
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        setTimeout(() => document.getElementById('dashboard-detail')?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }), 60)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [openKey])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const after = place.after && place.after.startsWith('w:') && isWidget ? place.after : openKey
  const detailProps = { onOpen: openClient, onClose: close, titleRef }
  const widgetDetail = {
    relances: () => <RelancesDetail dossiers={dossiers} {...detailProps} />,
    offers: () => <OffersDetail rows={offerRows} hot={hotProperties(offerRows)} match={match} {...detailProps} />,
    fixes: () => <FixesDetail f={fix} {...detailProps} />,
  }
  const widgetCompact = {
    relances: <RelancesCompact dossiers={dossiers} />,
    offers: <OffersCompact rows={offerRows} match={match} />,
    fixes: <FixesCompact f={fix} />,
  }

  const loading = clientsQ.isLoading
  const stageOptions = STAGES.map((s) => ({
    value: s, label: t(`${P}.stages.${s}`), count: s === 'all' ? base.length : base.filter((d) => d.stage === s).length,
  }))
  const select = 'rounded-lg border border-gray-200 bg-white py-1.5 pe-8 ps-2.5 text-[13px]'

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{t(`${P}.title`)}</h1>
          {!loading && <p className="mt-1 text-gray-500">{t(`${P}.clientsCount`, { count: dossiers.length })} {t(`${P}.agentsCount`, { count: agents })}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <IconAction icon={FiCalendar} label={t('dashboard.actions.planVisit')} to="/backoffice/visites/nouvelle" className="border border-gray-200 bg-white" />
          <IconAction icon={FiUserPlus} label={t(`${P}.actions.newClient`)} to="/backoffice/clients/nouveau" tone="primary" tipAlign="end" />
        </div>
      </div>

      {clientsQ.isError && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{t('crm.shared.loadError')}</p>}
      {summaryQ.isError && !clientsQ.isError && <Alert tone="plain" icon={FiAlertTriangle}>{t(`${P}.summaryUnavailable`)}</Alert>}

      {loading && (
        <div aria-busy="true" aria-label={t('crm.shared.loading')} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WIDGETS.map((w) => <div key={w.key} className="h-56 animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none" />)}
        </div>
      )}

      {!loading && !clientsQ.isError && dossiers.length > 0 && (
        <div ref={gridRef} className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WIDGETS.map((w) => {
            const k = `w:${w.key}`
            return [
              <Widget
                key={k}
                id={w.key}
                title={t(`${P}.${w.key}.title`)}
                icon={w.icon}
                open={openKey === k}
                onToggle={() => toggle(k)}
                cardRef={(el) => { anchors.current[k] = el }}
              >
                {widgetCompact[w.key]}
              </Widget>,
              isWidget && after === k ? (
                <DetailShell key="detail" shown={shown} notch={place.notch}>{widgetDetail[openKey.slice(2)]()}</DetailShell>
              ) : null,
            ]
          })}
        </div>
      )}

      {!loading && !clientsQ.isError && (
        <section aria-labelledby="clients-list-title" className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pt-5 sm:px-5">
            <h2 id="clients-list-title" className="flex items-center gap-2 font-display text-[14.5px] font-bold">
              <FiUsers className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{t(`${P}.list.title`)}
            </h2>
            <span className="text-[12.5px] text-gray-500">{t(`${P}.list.order`)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-5">
            <StageFilter label={t(`${P}.list.stageLabel`)} value={filters.stage} options={stageOptions} onChange={(v) => setFilter('stage', v)} />
            <label className="flex min-w-0 flex-[1_1_100%] items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-gray-500 sm:flex-initial">
              <FiSearch className="h-4 w-4 flex-none" aria-hidden="true" />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilter('q', e.target.value)}
                placeholder={t(`${P}.list.searchPlaceholder`)}
                aria-label={t(`${P}.list.searchLabel`)}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-gray-900 focus:outline-none focus:ring-0 sm:w-52"
              />
            </label>
            <select aria-label={t('crm.clients.list.filterTypeLabel')} value={filters.type} onChange={(e) => setFilter('type', e.target.value)} className={select}>
              <option value="">{t('crm.clients.list.filterTypeAll')}</option>
              {CLIENT_TYPES.map((k) => (
                <option key={k} value={k}>{t(`crm.clients.list.types.${k}.label`)} ({dossiers.filter((d) => d.client.client_type === k).length})</option>
              ))}
            </select>
            <select aria-label={t('crm.clients.list.filterStatusLabel')} value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={select}>
              <option value="">{t('crm.clients.list.filterStatusAll')}</option>
              {CLIENT_STATUSES.map((k) => (
                <option key={k} value={k}>{t(`crm.shared.status.${k}`)} ({dossiers.filter((d) => d.client.status === k).length})</option>
              ))}
            </select>
            {filtered && (
              <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-md px-1.5 py-1 text-[13px] font-semibold text-primary-700 hover:bg-primary-50">
                {t('crm.clients.list.resetFilters')}
              </button>
            )}
          </div>

          <div className="grid px-2 pb-2 sm:px-5">
            <div aria-hidden="true" className={`${ROW} hidden px-2 pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500 md:grid`}>
              <span>{t(`${P}.cols.client`)}</span>
              <span>{t(`${P}.cols.status`)}</span>
              <span className="hidden xl:block">{t(`${P}.cols.agent`)}</span>
              <span>{t(`${P}.cols.current`)}</span>
              <span>{t(`${P}.cols.lastExchange`)}</span>
              <span />
            </div>
            {!rows.length && (
              <p className="px-2 py-7 text-center text-gray-500">
                {dossiers.length ? t(`${P}.list.emptyFiltered`) : t('crm.clients.list.empty.default')}
              </p>
            )}
            {rows.map((d) => {
              const k = `c:${d.id}`
              const isOpen = openKey === k
              const cur = current(d)
              return [
                <div
                  key={k}
                  ref={(el) => { anchors.current[k] = el }}
                  className={`${ROW} items-center rounded-lg border-t border-gray-100 px-2 py-2.5 text-[13px] ${isOpen ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                >
                  <div className={`col-span-2 row-start-1 min-w-0 ${CELL}`}>
                    <b className="block truncate font-semibold">{d.name}</b>
                    <span className="block truncate text-xs text-gray-500">{[typeLabel(d.client.client_type), d.client.city].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className={`col-start-1 row-start-2 ${CELL}`}><StatusChip status={d.client.status} /></div>
                  <div className="hidden truncate xl:block">{d.client.assigned_to_name || t(`${P}.noAgentShort`)}</div>
                  <div className={`col-span-full row-start-3 min-w-0 ${CELL}`}>
                    <span className="block truncate">{cur || <span className="text-gray-500">{t(`${P}.current.nothing`)}</span>}</span>
                    <Flag flag={flagOf(d)} />
                  </div>
                  <div className={`col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-1.5 md:flex-col md:items-start md:gap-0.5 ${CELL}`}>
                    <AgeChip age={d.age} />
                    {d.last && <span className="text-xs text-gray-500">{fmtDate(d.last, { day: 'numeric', month: 'short' })}</span>}
                  </div>
                  <div className={`col-start-3 row-start-1 self-start text-end md:self-center ${CELL}`}>
                    <IconAction
                      icon={FiChevronDown}
                      tone="gold"
                      tipAlign="end"
                      label={isOpen ? t('dashboard.collapse') : t(`${P}.list.expand`, { name: d.name })}
                      onClick={() => toggle(k)}
                      aria-expanded={isOpen}
                      aria-controls="dashboard-detail"
                      className={`[&>svg]:transition-transform [&>svg]:duration-200 motion-reduce:[&>svg]:transition-none ${isOpen ? '[&>svg]:rotate-180' : ''}`}
                    />
                  </div>
                </div>,
                isOpen ? (
                  <DetailShell key="detail" shown={shown} notch={place.notch}>
                    <ClientDetailView d={d} others={others} now={now} onClose={close} onDelete={handleDelete} titleRef={titleRef} />
                  </DetailShell>
                ) : null,
              ]
            })}
          </div>
          <p className="border-t border-gray-100 px-4 pb-4 pt-2.5 text-xs text-gray-500 sm:px-7">
            {t(`${P}.list.footer`, { count: rows.length })}
            {rows.length < dossiers.length ? ` ${t(`${P}.list.footerOf`, { total: dossiers.length })}` : ''}
            {' · '}{t(`${P}.list.inactiveLast`)}
          </p>
        </section>
      )}
    </div>
  )
}
