import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiBarChart2, FiCalendar, FiCheckSquare, FiClock, FiFilePlus, FiInbox, FiKey, FiPlus, FiSearch, FiUserPlus } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { useFormat } from '../../../utils/format'
import { IconAction, Widget } from '../components/kit'
import { DetailRegion } from './parts'
import SummaryBand from './overview/SummaryBand'
import { LateCompact, LateDetail } from './overview/LateWidget'
import { DueCompact, DueDetail } from './overview/DueWidget'
import { ApplicationsCompact, ApplicationsDetail } from './overview/ApplicationsWidget'
import { CashCompact, CashDetail } from './overview/CashWidget'
import { InventoriesCompact, InventoriesDetail } from './overview/InventoriesWidget'

const WIDGETS = [
  { key: 'late', icon: FiClock, Compact: LateCompact, Detail: LateDetail },
  { key: 'due', icon: FiCalendar, Compact: DueCompact, Detail: DueDetail },
  { key: 'apps', icon: FiInbox, Compact: ApplicationsCompact, Detail: ApplicationsDetail },
  { key: 'cash', icon: FiBarChart2, span: 'md:col-span-2', Compact: CashCompact, Detail: CashDetail },
  { key: 'edl', icon: FiCheckSquare, Compact: InventoriesCompact, Detail: InventoriesDetail },
]

const isWidget = (k) => WIDGETS.some((x) => x.key === k)

const STORE = 'rental-open'
function readOpen() {
  try { return localStorage.getItem(STORE) || null } catch { return null }
}
function writeOpen(key) { try { localStorage.setItem(STORE, key || '') } catch { /* stockage indisponible */ } }

function RentalLayout() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: s, error } = useQuery('rental-summary', () => rentalService.summary(), { refetchInterval: 60000 })
  const gated = error?.response?.status === 403
  const [query, setQuery] = useState('')

  const [openKey, setOpenKey] = useState(readOpen)
  const [shown, setShown] = useState(false)
  const [place, setPlace] = useState({ after: null, notch: 0 })
  const [tick, setTick] = useState(0)
  const gridRef = useRef(null)
  const cardRefs = useRef({})
  const titleRef = useRef(null)
  const focusTitle = useRef(false)
  const closeTimer = useRef(null)

  const close = useCallback(() => {
    if (!openKey) return
    const k = openKey
    setShown(false)
    writeOpen(null)
    closeTimer.current = setTimeout(() => setOpenKey(null), 240)
    document.querySelector(`[data-disclose="${k}"]`)?.focus({ preventScroll: true })
  }, [openKey])

  const toggle = useCallback((key) => {
    if (key === openKey) { close(); return }
    clearTimeout(closeTimer.current)
    focusTitle.current = true
    setShown(false)
    setOpenKey(key)
    writeOpen(key)
  }, [openKey, close])

  // Un bail déplié appartient à son onglet : changer d'onglet le replie.
  useEffect(() => { setOpenKey((k) => (k && !isWidget(k) ? null : k)) }, [pathname])

  useLayoutEffect(() => {
    if (!openKey || !s || !isWidget(openKey)) return
    const card = cardRefs.current[openKey]
    const grid = gridRef.current
    if (!card || !grid) return
    const row = WIDGETS.map((x) => cardRefs.current[x.key]).filter((el) => el && el.offsetTop === card.offsetTop)
    const after = WIDGETS.find((x) => cardRefs.current[x.key] === row.at(-1))?.key || openKey
    const g = grid.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const rtl = getComputedStyle(grid).direction === 'rtl'
    const notch = (rtl ? g.right - c.right : c.left - g.left) + c.width / 2
    setPlace((p) => (p.after === after && Math.abs(p.notch - notch) < 1 ? p : { after, notch }))
  }, [openKey, s, tick])

  useEffect(() => {
    const onResize = () => setTick((n) => n + 1)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!openKey) return undefined
    const id = requestAnimationFrame(() => {
      setShown(true)
      if (focusTitle.current) {
        focusTitle.current = false
        titleRef.current?.focus({ preventScroll: true })
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        setTimeout(() => document.getElementById('rental-detail')?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }), 60)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [openKey])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const open = s && WIDGETS.find((x) => x.key === openKey)
  const after = place.after && isWidget(place.after) ? place.after : openKey
  const counts = s?.counts
  const TABS = [
    { to: 'baux', label: t('backoffice:rental.layout.tabs.leases'), count: counts?.leases },
    { to: '', label: t('backoffice:rental.layout.tabs.mandates'), end: true, count: counts?.mandates },
    { to: 'candidatures', label: t('backoffice:rental.layout.tabs.applications'), count: s?.applications?.total },
  ]
  const create = (to) => navigate(to, { state: { create: Date.now() } })

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('backoffice:rental.shared.pageTitle')}</h1>
          <p className="mt-1 text-gray-500">{fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <IconAction icon={FiUserPlus} label={t('backoffice:rental.overview.newApplication')} onClick={() => create('candidatures')} className="border border-gray-200 bg-white" />
          <IconAction icon={FiFilePlus} label={t('backoffice:rental.mandate.newButton')} onClick={() => create('')} className="border border-gray-200 bg-white" />
          <IconAction icon={FiPlus} label={t('backoffice:rental.lease.newButton')} onClick={() => create('baux')} tone="primary" tipAlign="end" />
        </div>
      </div>

      {s && <SummaryBand s={s} />}
      {!s && !error && (
        <div aria-busy="true" aria-label={t('backoffice:rental.shared.loading')} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WIDGETS.map((x) => <div key={x.key} className={`h-48 animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none ${x.span || ''}`} />)}
        </div>
      )}
      {error && !gated && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{t('backoffice:rental.overview.loadError')}</p>}

      {s && (
        <div ref={gridRef} className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WIDGETS.map((x) => {
            const C = x.Compact
            return [
              <Widget key={x.key} id={x.key} title={t(`backoffice:rental.overview.widgets.${x.key}`)} icon={x.icon}
                open={openKey === x.key} onToggle={() => toggle(x.key)} className={x.span || ''}
                cardRef={(el) => { cardRefs.current[x.key] = el; el?.querySelector('[aria-expanded]')?.setAttribute('data-disclose', x.key) }}>
                <C s={s} />
              </Widget>,
              open && after === x.key
                ? <div key="detail" className="contents">
                  <DetailRegion shown={shown} notch={place.notch}><open.Detail s={s} onClose={close} titleRef={titleRef} /></DetailRegion>
                </div>
                : null,
            ]
          })}
        </div>
      )}

      <section aria-labelledby="rental-register" className="grid min-w-0 gap-3.5 rounded-xl border border-gray-200 bg-white px-3.5 pb-3 pt-[18px] sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2.5">
          <h2 id="rental-register" className="flex items-center gap-2 font-display text-[15px] font-bold">
            <FiKey className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{t('backoffice:rental.overview.register')}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <nav aria-label={t('backoffice:rental.overview.registerTabs')} className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-[3px]">
              {TABS.map((tab) => (
                <NavLink key={tab.to} to={tab.to} end={tab.end}
                  className={({ isActive }) => `rounded-md px-2.5 py-1 text-[12.5px] ${isActive ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-600'}`}>
                  {tab.label}{tab.count != null && <span className="ms-1 font-semibold text-gray-400">{tab.count}</span>}
                </NavLink>
              ))}
            </nav>
            <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-gray-400 sm:flex-none">
              <FiSearch className="h-[15px] w-[15px] flex-none" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('backoffice:rental.overview.searchPlaceholder')} aria-label={t('backoffice:rental.overview.searchLabel')}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-gray-900 outline-none focus:ring-0 sm:w-[190px]" />
            </label>
          </div>
        </div>
        <div className="min-w-0"><Outlet context={{ query, openKey, toggle, close, shown, titleRef }} /></div>
      </section>
    </div>
  )
}
export default RentalLayout
