import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiCalendar, FiGrid, FiHome, FiKey, FiMail, FiPlus, FiTrendingUp, FiUserPlus } from 'react-icons/fi'
import api from '../../services/api'
import { useFormat } from '../../utils/format'
import { IconAction, Segmented, Widget } from './components/kit'
import { gridCols, rowEnd } from './components/kitTokens'
import { LeadsCompact, LeadsDetail } from './dashboard/LeadsWidget'
import { VisitsCompact, VisitsDetail } from './dashboard/VisitsWidget'
import { ResultsCompact, ResultsDetail } from './dashboard/ResultsWidget'
import { PipelineCompact, PipelineDetail } from './dashboard/PipelineWidget'
import { PortfolioCompact, PortfolioDetail } from './dashboard/PortfolioWidget'
import { RentalCompact, RentalDetail } from './dashboard/RentalWidget'
import OnboardingCard from './dashboard/OnboardingCard'
import { rentalService } from '../../services/rentalService'

// Même clé et même requête que la sidebar (badges) : react-query partage la réponse.
const fetchDashboard = async () => (await api.get('/backoffice/dashboard')).data

// Filtre d'activité : un seul contrôle pour toute la page. Vente et location n'ont ni les
// mêmes étapes ni les mêmes unités — on les montre côte à côte, jamais additionnées.
const ACTIVITIES = ['all', 'sale', 'rent']
/**
 * Garde les lignes de l'activité choisie ; `all` ne filtre rien.
 *
 * Une ligne sans activité connue (lead sans bien rattaché, visite sur un bien supprimé)
 * reste visible dans les deux vues : filtrer, c'est trier son travail, jamais le faire
 * disparaître. Sinon un lead saisi au téléphone, sans bien, n'existerait qu'en « Tout ».
 */
const only = (rows, activity, key = 'transaction_type') => (
  activity === 'all' ? rows : rows.filter((r) => !r[key] || r[key] === activity))

const WIDGETS = [
  { key: 'leads', icon: FiMail, Compact: LeadsCompact, Detail: LeadsDetail,
    props: (w, a) => ({ leads: only(w.new_leads || [], a) }) },
  { key: 'visits', icon: FiCalendar, Compact: VisitsCompact, Detail: VisitsDetail,
    props: (w, a) => ({ visits: only(w.upcoming_visits || [], a),
                        outcomes: a === 'all' ? w.recent_visit_outcomes : w.recent_visit_outcomes?.[a] }) },
  { key: 'results', icon: FiTrendingUp, Compact: ResultsCompact, Detail: ResultsDetail,
    props: (w, a) => ({ closed: only(w.closed || [], a, 'type') }) },
  { key: 'pipe', icon: FiGrid, span: 'md:col-span-2', Compact: PipelineCompact, Detail: PipelineDetail,
    props: (w, a) => ({ pipeline: w.pipeline, weekly: w.leads_weekly || [], closed: w.closed || [], activity: a }) },
  { key: 'props', icon: FiHome, Compact: PortfolioCompact, Detail: PortfolioDetail,
    props: (w, a) => ({ listings: a === 'all' ? w.listings : {
      ...w.listings,
      by_status: w.listings?.by_status_by_type?.[a] || {},
      active: only(w.listings?.active || [], a),
    } }) },
  // Gestion locative : sa propre source (service rental), et rien à montrer côté vente.
  { key: 'rental', icon: FiKey, Compact: RentalCompact, Detail: RentalDetail,
    hidden: (a) => a === 'sale', props: (w) => ({ summary: w.rental }) },
]
const TITLE_KEYS = { leads: 'leads.title', visits: 'visits.title', results: 'results.title',
  pipe: 'pipeline.title', props: 'portfolio.title', rental: 'rental.title' }

const STORE = 'dash-open'
function readOpen() {
  // Le pipeline est ouvert au premier passage, pour montrer le mécanisme ; ensuite on retrouve
  // l'état laissé par l'agent (y compris « tout replié », stocké comme chaîne vide).
  try { const s = localStorage.getItem(STORE); return s === null ? 'pipe' : s || null } catch { return 'pipe' }
}
function writeOpen(key) { try { localStorage.setItem(STORE, key || '') } catch { /* stockage indisponible */ } }

const ACT_STORE = 'dash-activity'
function readActivity() { try { return localStorage.getItem(ACT_STORE) } catch { return null } }
function writeActivity(v) { try { localStorage.setItem(ACT_STORE, v) } catch { /* stockage indisponible */ } }

/** Activité dominante des dossiers en cours : une agence de gestion ouvre sur la location. */
function dominantActivity(pipeline) {
  const count = (rows) => (rows || []).reduce((n, r) => n + r.count, 0)
  const rent = count(pipeline?.rent)
  const total = rent + count(pipeline?.sale)
  return total > 0 && rent / total > 0.7 ? 'rent' : 'all'
}

export default function BackofficeDashboard() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const { data, isLoading, isError } = useQuery('backoffice-dashboard', fetchDashboard, { refetchInterval: 60000 })
  const now = new Date()
  const [activity, setActivity] = useState(readActivity)
  // La gestion locative vit dans son propre service : requête à part, silencieuse si le
  // plan de l'agence ne l'ouvre pas (403) — le widget disparaît alors de lui-même.
  const { data: rental } = useQuery('backoffice-rental-summary', () => rentalService.summary(60),
    { enabled: activity !== 'sale', retry: false, refetchInterval: 60000 })
  const w = { ...(data?.widgets || {}), rental }

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
    cardRefs.current[k]?.querySelector('[aria-expanded]')?.focus({ preventScroll: true })
  }, [openKey])

  const toggle = (key) => {
    if (key === openKey) { close(); return }
    clearTimeout(closeTimer.current)
    focusTitle.current = true
    setShown(false)
    setOpenKey(key)
    writeOpen(key)
  }

  // Place le détail après la DERNIÈRE carte de la rangée du widget ouvert, et aligne le repère
  // sur ce widget. Mesuré avant affichage, et recalculé quand la largeur change la grille.
  useLayoutEffect(() => {
    if (!openKey || !data) return
    const card = cardRefs.current[openKey]
    const grid = gridRef.current
    if (!card || !grid) return
    const keys = WIDGETS.filter((x) => !(x.hidden?.(activity || 'all') || (x.key === 'rental' && !rental))).map((x) => x.key)
    const after = rowEnd(keys, openKey, gridCols(grid), (k) => (WIDGETS.find((x) => x.key === k).span ? 2 : 1))
    const g = grid.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const rtl = getComputedStyle(grid).direction === 'rtl'
    const notch = (rtl ? g.right - c.right : c.left - g.left) + c.width / 2
    setPlace((p) => (p.after === after && Math.abs(p.notch - notch) < 1 ? p : { after, notch }))
  }, [openKey, data, tick, activity, rental])

  // Premier passage : l'activité n'est pas choisie, on l'infère des dossiers en cours.
  useEffect(() => {
    if (activity === null && data) setActivity(dominantActivity(data.widgets?.pipeline))
  }, [activity, data])

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
        setTimeout(() => gridRef.current?.querySelector('#dashboard-detail')?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }), 60)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [openKey])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const act = activity || 'all'
  const shownWidgets = WIDGETS.filter((x) => !(x.hidden?.(act) || (x.key === 'rental' && !rental)))
  const open = shownWidgets.find((x) => x.key === openKey)
  const after = place.after && shownWidgets.some((x) => x.key === place.after) ? place.after : openKey
  const title = (x) => (x.key === 'results'
    ? t('dashboard.results.title', { month: fmtDate(now, { month: 'long' }) })
    : t(`dashboard.${TITLE_KEYS[x.key]}`))

  const detail = open && (
    <div
      id="dashboard-detail"
      role="region"
      aria-labelledby="dashboard-detail-title"
      className="col-span-full grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: shown ? '1fr' : '0fr' }}
    >
      <div className="min-h-0 overflow-hidden pt-2.5">
        <div className="relative rounded-xl border border-primary-400 bg-white shadow-[0_1px_2px_rgba(11,18,32,.04),0_14px_30px_-20px_rgba(11,18,32,.25)]">
          <span aria-hidden="true" className="absolute -top-[8px] h-3.5 w-3.5 -ms-[7px] rotate-45 border-s border-t border-primary-400 bg-white" style={{ insetInlineStart: place.notch }} />
          <open.Detail {...open.props(w, act)} now={now} onClose={close} titleRef={titleRef} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-1 text-gray-500">{fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label={t('dashboard.activity.label')}
            value={act}
            onChange={(v) => { setActivity(v); writeActivity(v) }}
            options={ACTIVITIES.map((v) => ({ value: v, label: t(`dashboard.activity.${v}`) }))}
          />
          <div className="flex items-center gap-1.5">
          <IconAction icon={FiCalendar} label={t('dashboard.actions.planVisit')} to="/backoffice/visites/nouvelle" className="border border-gray-200 bg-white" />
          <IconAction icon={FiUserPlus} label={t('dashboard.actions.newClient')} to="/backoffice/clients/nouveau" className="border border-gray-200 bg-white" />
          <IconAction icon={FiPlus} label={t('dashboard.actions.addProperty')} to="/backoffice/biens/nouveau" tone="primary" tipAlign="end" />
          </div>
        </div>
      </div>

      <OnboardingCard />

      {isError && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{t('dashboard.loadError')}</p>}
      {isLoading && (
        <div aria-busy="true" aria-label={t('dashboard.loading')} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WIDGETS.map((x) => <div key={x.key} className={`h-56 animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none ${x.span || ''}`} />)}
        </div>
      )}

      {data && (
        <div ref={gridRef} className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shownWidgets.map((x) => {
            const C = x.Compact
            return [
              <Widget
                key={x.key}
                id={x.key}
                title={title(x)}
                icon={x.icon}
                open={openKey === x.key}
                onToggle={() => toggle(x.key)}
                className={x.span || ''}
                cardRef={(el) => { cardRefs.current[x.key] = el }}
              >
                <C {...x.props(w, act)} now={now} />
              </Widget>,
              after === x.key ? <div key="detail" className="contents">{detail}</div> : null,
            ]
          })}
        </div>
      )}
    </div>
  )
}
