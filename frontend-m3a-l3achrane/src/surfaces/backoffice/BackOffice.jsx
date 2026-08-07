import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, Icon, Input, Tabs, VerifiedBadge } from '../../ds/index.js'
import {
  approveBackofficeListing,
  getBackofficeContracts,
  getBackofficeLifestyleReferential,
  getBackofficeListings,
  getBackofficeMatchingWeights,
  getBackofficeOverview,
  getBackofficeReports,
  getBackofficeRoles,
  getBackofficeUsers,
  getBackofficeVerifications,
  reactivateBackofficeUser,
  rejectBackofficeListing,
  rejectBackofficeVerification,
  suspendBackofficeUser,
  updateBackofficeMatchingWeights,
  verifyBackofficeVerification,
} from '../../services/index.js'
import {
  ACTIVITY_LOG,
  ADMIN_PROFILE,
  BACKOFFICE_NAV,
  MATCHES_CHART,
  TODAY_TODO,
  VERIFICATION_QUEUE_NOTE,
  VERIF_TABS,
} from '../../data/backofficeAdmin.js'

// Nombre → chaîne localisée FR ("1 284") ; `—` si absent (dégradation d'un sous-service).
const fmtCount = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : '—')

// KPIs réels de la vue d'ensemble à partir de l'agrégat BFF `/api/v1/backoffice/overview`.
// `data` peut avoir des sous-clés `null` (service en panne) → chaque KPI se dégrade en isolation.
function buildOverviewKpis(data) {
  const users = data?.users ?? null
  const listings = data?.listings ?? null
  const profiles = data?.profiles ?? null
  return [
    { id: 'total-users', value: fmtCount(users?.total_users) },
    { id: 'active-listings', value: fmtCount(listings?.published_listings) },
    { id: 'verified-profiles', value: fmtCount(profiles?.verified_profiles) },
    { id: 'in-moderation-listings', value: fmtCount(listings?.in_moderation_listings) },
  ]
}

const ACTIVITY_TONE = { validated: 'verified', rejected: 'danger', in_progress: 'warning' }
// Statuts réels de la machine à états coloc-listing (cf. state_machine.py) — seuls
// EN_MODERATION/PUBLIEE/REJETEE sont attendus dans la file de modération.
const LISTING_TONE = { EN_MODERATION: 'warning', PUBLIEE: 'verified', REJETEE: 'danger' }

function sectionTitle(children) {
  return <h2 style={{ margin: 0, font: 'var(--fw-extrabold) 15.5px var(--font-display)', color: 'var(--text-heading)' }}>{children}</h2>
}

function Sidebar({ active, onSelect }) {
  const { t } = useTranslation(['backoffice'])
  return (
    <aside
      style={{
        background: 'var(--surface-navy-deep)',
        color: 'var(--text-on-navy)',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
        padding: '22px 16px',
        position: 'sticky',
        insetBlockStart: 0,
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
        <div style={{ font: 'var(--fw-extrabold) 17px var(--font-display)', letterSpacing: '-0.02em' }}>{t('backoffice:sidebar.brand')}</div>
        <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', letterSpacing: '.14em', color: 'var(--gold-500)', textTransform: 'uppercase' }}>
          {t('backoffice:sidebar.brandTag')}
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {BACKOFFICE_NAV.map((item) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'start',
                padding: '10px 12px', border: 0, borderRadius: 9, cursor: 'pointer',
                background: on ? 'var(--navy-600)' : 'transparent',
                color: on ? '#fff' : 'var(--text-on-navy-muted)',
                font: `var(--fw-${on ? 'bold' : 'semibold'}) var(--fs-sm) var(--font-display)`,
                transition: 'background var(--dur-fast) var(--ease-standard)',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.07)' }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon name={item.icon} size={16} strokeWidth={2.2} />
              <span style={{ flex: 1 }}>{t(`backoffice:sidebar.nav.${item.id}.label`, { defaultValue: item.label })}</span>
              {item.count != null && (
                <span
                  style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                    background: on ? 'var(--gold-500)' : 'rgba(255,255,255,.13)',
                    color: on ? 'var(--navy-900)' : '#fff',
                  }}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div style={{ marginBlockStart: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ font: 'var(--fw-extrabold) 12.5px var(--font-body)', color: 'var(--gold-400)' }}>
            {t('backoffice:sidebar.queueNote.title', { defaultValue: VERIFICATION_QUEUE_NOTE.title })}
          </div>
          <div style={{ font: 'var(--fw-regular) 12.5px/1.5 var(--font-body)', color: 'var(--text-on-navy-muted)' }}>
            {t('backoffice:sidebar.queueNote.body', { defaultValue: VERIFICATION_QUEUE_NOTE.body })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--navy-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flex: 'none' }}>
            {ADMIN_PROFILE.initials}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--fw-bold) 13px var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ADMIN_PROFILE.name}</div>
            <div style={{ font: 'var(--fw-regular) 11.5px var(--font-body)', color: 'var(--text-on-navy-muted)' }}>{ADMIN_PROFILE.role}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function TopHeader({ title, subtitle }) {
  const { t } = useTranslation(['backoffice'])
  const [query, setQuery] = useState('')
  return (
    <header
      style={{
        background: 'var(--surface-card)', borderBottom: '1px solid var(--border-subtle)',
        padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 20,
        position: 'sticky', insetBlockStart: 0, zIndex: 4,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 20px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>{title}</h1>
        <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 320 }}>
          <Input
            icon="search"
            placeholder={t('backoffice:header.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ font: 'var(--fw-regular) 13.5px var(--font-body)' }}
          />
        </div>
        <Button variant="secondary" size="sm" iconLeft="download">{t('backoffice:header.export')}</Button>
        <Button variant="primary" size="sm" iconLeft="plus">{t('backoffice:header.newAction')}</Button>
      </div>
    </header>
  )
}

function KpiCard({ label, value, delta, trend }) {
  const { t } = useTranslation(['backoffice'])
  const trendColor = trend === 'up' ? 'var(--green-600)' : 'var(--red-600)'
  const arrow = trend === 'up' ? '▲' : '▼'
  return (
    <Card padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-muted)', letterSpacing: '.01em' }}>{label}</div>
      <div style={{ font: 'var(--fw-extrabold) 30px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {/* Deltas/tendances non disponibles côté API réelle (compteurs live, pas de série historique) */}
      {delta != null && (
        <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: trendColor }}>
          {arrow} {delta} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('backoffice:kpi.vsPeriod')}</span>
        </div>
      )}
    </Card>
  )
}

function OverviewView() {
  const { t } = useTranslation(['backoffice'])
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const maxValue = Math.max(...MATCHES_CHART.map((b) => b.value))

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeOverview()
      .then((data) => { if (!cancelled) setOverview(data) })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const kpis = buildOverviewKpis(overview)

  return (
    <>
      {loading && (
        <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:overview.loading')}
        </div>
      )}
      {!loading && loadError && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:overview.loadError')}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {kpis.map((k) => (
          <KpiCard key={k.id} value={k.value} label={t(`backoffice:overview.kpis.${k.id}`)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            {sectionTitle(t('backoffice:overview.matchesCard.title'))}
            <span style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{t('backoffice:overview.matchesCard.period')}</span>
            <span style={{ marginInlineStart: 'auto', font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--green-600)' }}>+18,4 %</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 190 }}>
            {MATCHES_CHART.map((b) => (
              <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifyContent: 'flex-end', height: '100%' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${(b.value / maxValue) * 100}%`,
                    borderRadius: '6px 6px 0 0',
                    background: b.value / maxValue > 0.85 ? 'var(--navy-700)' : 'var(--navy-500)',
                  }}
                />
                <div style={{ font: 'var(--fw-semibold) 11px var(--font-body)', color: 'var(--text-muted)' }}>{b.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle(t('backoffice:overview.todoCard.title'))}
          {TODAY_TODO.map((td) => (
            <div key={td.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 11, background: 'var(--surface-sunken)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-500)', marginBlockStart: 6, flex: 'none' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ font: 'var(--fw-bold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{td.title}</div>
                <div style={{ font: 'var(--fw-regular) 12.5px/1.5 var(--font-body)', color: 'var(--text-muted)' }}>{td.meta}</div>
              </div>
              <Button variant="secondary" size="sm" iconLeft="arrow-right" style={{ marginInlineStart: 'auto', flex: 'none' }}>{t('backoffice:overview.todoCard.open')}</Button>
            </div>
          ))}
        </Card>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {sectionTitle(t('backoffice:overview.activityLog.title'))}
          <span style={{ marginInlineStart: 'auto', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:overview.activityLog.timezoneNote')}
          </span>
        </div>
        {ACTIVITY_LOG.map((a) => {
          const tone = ACTIVITY_TONE[a.status]
          const label = t(`backoffice:overview.status.${a.status}`, { defaultValue: a.status })
          return (
            <div
              key={a.id}
              style={{
                display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 180px 130px', gap: 16, alignItems: 'center',
                padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5,
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{a.time}</div>
              <div style={{ color: 'var(--text-body)' }}>{a.text}</div>
              <div style={{ color: 'var(--text-muted)' }}>{a.actor}</div>
              <div style={{ justifySelf: 'start' }}><Badge tone={tone}>{label}</Badge></div>
            </div>
          )
        })}
      </Card>
    </>
  )
}

// Âge d'une candidature KYC (`created_at` ISO) → { unit, count } pour i18n pluriel
// (`backoffice:verif.age.<unit>`). `null` si la date est absente (dégradation propre).
function verifAge(iso) {
  if (!iso) return null
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 60) return { unit: 'minutes', count: minutes }
  const hours = Math.round(minutes / 60)
  if (hours < 24) return { unit: 'hours', count: hours }
  return { unit: 'days', count: Math.round(hours / 24) }
}

function VerifView() {
  const { t } = useTranslation(['backoffice'])
  const [tab, setTab] = useState(VERIF_TABS[0].id)
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // id en cours de traitement
  const tabs = VERIF_TABS.map((tb) => ({ value: tb.id, label: t(`backoffice:verif.tabs.${tb.id}`, { defaultValue: tb.label }), icon: tb.icon }))

  const load = () => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeVerifications()
      .then((data) => {
        if (cancelled) return
        const rows = data?.items ?? []
        setItems(rows)
        setSelectedId((current) => (rows.some((r) => r.id === current) ? current : rows[0]?.id ?? null))
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }

  useEffect(load, [])

  // La file backend ne couvre que les candidatures `pending` (v1) — les autres onglets
  // n'ont pas encore de source de données réelle, on affiche l'état vide plutôt qu'un mock.
  const rows = tab === 'pending' ? items : []
  const selected = rows.find((v) => v.id === selectedId) || null

  const runAction = (kycId, action) => {
    setPendingAction(kycId)
    setActionError(false)
    const call = action === 'verify' ? verifyBackofficeVerification : rejectBackofficeVerification
    call(kycId)
      .then(() => {
        setItems((prev) => prev.filter((v) => v.id !== kycId))
        setSelectedId((current) => (current === kycId ? null : current))
        setNote('')
      })
      .catch(() => setActionError(true))
      .finally(() => setPendingAction(null))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 372px', gap: 16, alignItems: 'start' }}>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} style={{ borderBottom: 'none' }} />
          <span style={{ marginInlineStart: 'auto', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:verif.pendingCount', { count: rows.length })}
          </span>
        </div>
        {loading && (
          <div style={{ padding: '18px', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:verif.loading')}
          </div>
        )}
        {!loading && loadError && (
          <div style={{ padding: '18px', font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
            {t('backoffice:verif.loadError')}
          </div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div style={{ padding: '18px', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:verif.empty')}
          </div>
        )}
        {!loading && !loadError && rows.map((v) => {
          const age = verifAge(v.created_at)
          const busy = pendingAction === v.id
          return (
            <div
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              style={{
                display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 150px 120px 96px', gap: 14, alignItems: 'center',
                padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                background: v.id === selectedId ? 'var(--gray-50)' : 'transparent',
              }}
            >
              <Avatar name={v.full_name || v.email} size={40} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ font: 'var(--fw-bold) 14px var(--font-display)', color: 'var(--text-heading)' }}>{v.full_name || v.email}</div>
                <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{v.email}</div>
              </div>
              <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-body)' }}>
                {t('backoffice:verif.cinDoc', { last4: v.cin_last4 || '····' })}
              </div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {age ? t(`backoffice:verif.age.${age.unit}`, { count: age.count }) : '—'}
              </div>
              <div style={{ display: 'flex', gap: 6, justifySelf: 'end' }}>
                <button
                  type="button"
                  title={t('backoffice:verif.approveRowLabel')}
                  aria-label={t('backoffice:verif.approveRowLabel')}
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); runAction(v.id, 'verify') }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', border: 0, borderRadius: 7, background: 'var(--green-100)', color: 'var(--green-700)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                >
                  <Icon name="check" size={16} strokeWidth={2.6} />
                </button>
                <button
                  type="button"
                  title={t('backoffice:verif.rejectRowLabel')}
                  aria-label={t('backoffice:verif.rejectRowLabel')}
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); runAction(v.id, 'reject') }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', border: 0, borderRadius: 7, background: 'var(--red-100)', color: 'var(--red-600)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                >
                  <Icon name="x" size={16} strokeWidth={2.6} />
                </button>
              </div>
            </div>
          )
        })}
      </Card>

      <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', insetBlockStart: 96 }}>
        {!selected && (
          <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:verif.noSelection')}
          </div>
        )}
        {selected && (
          <>
            <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
              <Avatar name={selected.full_name || selected.email} size={52} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ font: 'var(--fw-extrabold) 16px var(--font-display)', color: 'var(--text-heading)' }}>{selected.full_name || selected.email}</div>
                <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{selected.email}</div>
              </div>
            </div>
            <div
              style={{
                height: 186, borderRadius: 12, background: 'var(--gray-150)', border: '1px dashed var(--border-default)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                fontSize: 12.5, textAlign: 'center', padding: 16, boxSizing: 'border-box',
              }}
            >
              {t('backoffice:verif.documentPreview', { doc: t('backoffice:verif.cinDoc', { last4: selected.cin_last4 || '····' }) })}
              <br />{t('backoffice:verif.documentPreviewNote')}
            </div>
            {actionError && (
              <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
                {t('backoffice:verif.actionError')}
              </div>
            )}
            <textarea
              placeholder={t('backoffice:verif.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{
                minHeight: 78, padding: 11, border: '1px solid var(--border-subtle)', borderRadius: 10,
                font: '13px/1.5 var(--font-body)', color: 'var(--text-heading)', resize: 'vertical', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                variant="primary" fullWidth iconLeft="check" disabled={pendingAction === selected.id}
                onClick={() => runAction(selected.id, 'verify')}
                style={{ background: 'var(--green-600)', border: '1px solid var(--green-600)' }}
              >
                {t('backoffice:verif.validate')}
              </Button>
              <Button
                variant="danger" fullWidth iconLeft="x" disabled={pendingAction === selected.id}
                onClick={() => runAction(selected.id, 'reject')}
                style={{ background: 'var(--white)', color: 'var(--red-600)', border: '1px solid var(--red-500)' }}
              >
                {t('backoffice:verif.reject')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// Loyer réel (rent + currency backend) → chaîne localisée FR ("2 400 MAD").
const fmtRent = (rent, currency) =>
  typeof rent === 'number' ? `${rent.toLocaleString('fr-FR')} ${currency || ''}`.trim() : '—'

function ListingsView() {
  const { t } = useTranslation(['backoffice'])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // id en cours de traitement

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeListings()
      .then((data) => { if (!cancelled) setItems(data?.items ?? []) })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const runAction = (listingId, action) => {
    setPendingAction(listingId)
    setActionError(false)
    const call = action === 'approve' ? approveBackofficeListing : rejectBackofficeListing
    call(listingId)
      .then(() => setItems((prev) => prev.filter((l) => l.id !== listingId)))
      .catch(() => setActionError(true))
      .finally(() => setPendingAction(null))
  }

  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px 120px 140px 120px 92px', gap: 16,
          padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)',
          font: 'var(--fw-extrabold) 12px var(--font-body)', color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase',
        }}
      >
        <div>{t('backoffice:listings.columns.listing')}</div>
        <div>{t('backoffice:listings.columns.city')}</div>
        <div>{t('backoffice:listings.columns.rent')}</div>
        <div>{t('backoffice:listings.columns.host')}</div>
        <div>{t('backoffice:listings.columns.status')}</div>
        <div style={{ justifySelf: 'end' }}>{t('backoffice:listings.columns.action')}</div>
      </div>
      {loading && (
        <div style={{ padding: '18px 20px', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:listings.loading')}
        </div>
      )}
      {!loading && loadError && (
        <div style={{ padding: '18px 20px', font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:listings.loadError')}
        </div>
      )}
      {!loading && !loadError && actionError && (
        <div style={{ padding: '10px 20px', font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:listings.actionError')}
        </div>
      )}
      {!loading && !loadError && items.length === 0 && (
        <div style={{ padding: '18px 20px', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:listings.empty')}
        </div>
      )}
      {!loading && !loadError && items.map((l) => {
        const tone = LISTING_TONE[l.status]
        const label = t(`backoffice:listings.status.${l.status}`, { defaultValue: l.status })
        const busy = pendingAction === l.id
        return (
          <div
            key={l.id}
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px 120px 140px 120px 92px', gap: 16, alignItems: 'center',
              padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: 46, height: 38, borderRadius: 8, background: 'var(--gray-150)', flex: 'none' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.id}</div>
              </div>
            </div>
            <div style={{ color: 'var(--text-body)' }}>{l.city}</div>
            <div style={{ color: 'var(--text-heading)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtRent(l.rent, l.currency)}</div>
            <div style={{ color: 'var(--text-body)' }}>{t('backoffice:listings.hostId', { id: l.owner_id ?? '—' })}</div>
            <div><Badge tone={tone}>{label}</Badge></div>
            <div style={{ display: 'flex', gap: 6, justifySelf: 'end' }}>
              <button
                type="button"
                title={t('backoffice:listings.approveRowLabel')}
                aria-label={t('backoffice:listings.approveRowLabel')}
                disabled={busy}
                onClick={() => runAction(l.id, 'approve')}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', border: 0, borderRadius: 7, background: 'var(--green-100)', color: 'var(--green-700)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                <Icon name="check" size={16} strokeWidth={2.6} />
              </button>
              <button
                type="button"
                title={t('backoffice:listings.rejectRowLabel')}
                aria-label={t('backoffice:listings.rejectRowLabel')}
                disabled={busy}
                onClick={() => runAction(l.id, 'reject')}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', border: 0, borderRadius: 7, background: 'var(--red-100)', color: 'var(--red-600)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                <Icon name="x" size={16} strokeWidth={2.6} />
              </button>
            </div>
          </div>
        )
      })}
      {!loading && !loadError && items.length > 0 && (
        <div style={{ padding: '14px 20px', font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:listings.count', { count: items.length })}
        </div>
      )}
    </Card>
  )
}

// Statut réel du compte (identity `_mod_state`) → tone du badge.
const USER_STATUS_TONE = { active: 'verified', suspended: 'danger', deleted: 'none' }
// account_role identity (buyer/agent/admin) → clé i18n du rôle affiché (parité seed m3a-demo).
const USER_ROLE_KEY = { buyer: 'seeker', agent: 'host', admin: 'admin' }

function fmtJoined(iso, lang) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function buildUserStats(items) {
  const total = items.length
  const active = items.filter((u) => u.status === 'active').length
  const suspended = items.filter((u) => u.status === 'suspended').length
  const verified = items.filter((u) => u.is_verified).length
  return [
    { id: 'total', value: total },
    { id: 'active', value: active },
    { id: 'suspended', value: suspended },
    { id: 'verified', value: verified },
  ]
}

function UsersView() {
  const { t, i18n } = useTranslation(['backoffice'])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // id en cours de traitement

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeUsers()
      .then((data) => { if (!cancelled) setItems(data?.items ?? []) })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const runAction = (userId, action) => {
    setPendingAction(userId)
    setActionError(false)
    const call = action === 'suspend' ? suspendBackofficeUser : reactivateBackofficeUser
    const nextStatus = action === 'suspend' ? 'suspended' : 'active'
    call(userId)
      .then(() => setItems((prev) => prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u))))
      .catch(() => setActionError(true))
      .finally(() => setPendingAction(null))
  }

  const stats = buildUserStats(items)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {stats.map((s) => (
          <Card key={s.id} padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
              {t(`backoffice:users.stats.${s.id}`)}
            </div>
            <div style={{ font: 'var(--fw-extrabold) 26px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fmtCount(s.value)}
            </div>
          </Card>
        ))}
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 130px 120px 110px 92px', gap: 16,
            padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)',
            font: 'var(--fw-extrabold) 12px var(--font-body)', color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase',
          }}
        >
          <div>{t('backoffice:users.columns.user')}</div>
          <div>{t('backoffice:users.columns.role')}</div>
          <div>{t('backoffice:users.columns.joined')}</div>
          <div>{t('backoffice:users.columns.verification')}</div>
          <div>{t('backoffice:users.columns.status')}</div>
          <div style={{ justifySelf: 'end' }}>{t('backoffice:users.columns.action')}</div>
        </div>
        {loading && (
          <div style={{ padding: '18px 20px', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:users.loading')}
          </div>
        )}
        {!loading && loadError && (
          <div style={{ padding: '18px 20px', font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
            {t('backoffice:users.loadError')}
          </div>
        )}
        {!loading && !loadError && actionError && (
          <div style={{ padding: '10px 20px', font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
            {t('backoffice:users.actionError')}
          </div>
        )}
        {!loading && !loadError && items.length === 0 && (
          <div style={{ padding: '18px 20px', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:users.empty')}
          </div>
        )}
        {!loading && !loadError && items.map((u) => {
          const roleKey = USER_ROLE_KEY[u.account_role]
          const roleLabel = roleKey ? t(`backoffice:users.role.${roleKey}`) : (u.account_role ?? '—')
          const verificationLabel = t(`backoffice:users.verification.${u.is_verified ? 'verified' : 'pending'}`)
          const statusLabel = t(`backoffice:users.status.${u.status}`, { defaultValue: u.status })
          const busy = pendingAction === u.id
          const isSuspended = u.status === 'suspended'
          return (
            <div
              key={u.id}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 130px 120px 110px 92px', gap: 16, alignItems: 'center',
                padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5,
              }}
            >
              <div style={{ display: 'flex', gap: 11, alignItems: 'center', minWidth: 0 }}>
                <Avatar name={u.name} size={34} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                </div>
              </div>
              <div style={{ color: 'var(--text-body)' }}>{roleLabel}</div>
              <div style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtJoined(u.created_at, i18n.language)}</div>
              <div><VerifiedBadge label={verificationLabel} level={u.is_verified ? 'full' : 'none'} size="sm" /></div>
              <div><Badge tone={USER_STATUS_TONE[u.status] ?? 'none'}>{statusLabel}</Badge></div>
              <div style={{ display: 'flex', justifySelf: 'end' }}>
                <button
                  type="button"
                  title={t(isSuspended ? 'backoffice:users.reactivateRowLabel' : 'backoffice:users.suspendRowLabel')}
                  aria-label={t(isSuspended ? 'backoffice:users.reactivateRowLabel' : 'backoffice:users.suspendRowLabel')}
                  disabled={busy}
                  onClick={() => runAction(u.id, isSuspended ? 'reactivate' : 'suspend')}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px',
                    border: 0, borderRadius: 7, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                    background: isSuspended ? 'var(--green-100)' : 'var(--red-100)',
                    color: isSuspended ? 'var(--green-700)' : 'var(--red-600)',
                  }}
                >
                  <Icon name={isSuspended ? 'rotate-ccw' : 'ban'} size={16} strokeWidth={2.6} />
                </button>
              </div>
            </div>
          )
        })}
      </Card>
    </>
  )
}

// Vue « Contrats & paiements » : aucun domaine colocation ne backe encore ce concept (les
// services contract/payment du monorepo sont cloisonnés par agence immobilière, cf.
// `getBackofficeContracts`) — état vide honnête plutôt que des données inventées.
function ContractsView() {
  const { t } = useTranslation(['backoffice'])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeContracts()
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <Card padding={24}>
      {loading && (
        <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:contracts.loading')}
        </div>
      )}
      {!loading && loadError && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:contracts.loadError')}
        </div>
      )}
      {!loading && !loadError && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Icon name="file-signature" size={20} strokeWidth={2} style={{ color: 'var(--text-muted)', flex: 'none', marginTop: 2 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ font: 'var(--fw-bold) 13.5px var(--font-body)', color: 'var(--text-heading)' }}>
              {t('backoffice:contracts.unavailableTitle')}
            </div>
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)', maxWidth: 560 }}>
              {t('backoffice:contracts.unavailable')}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function ReportsView() {
  const { t } = useTranslation(['backoffice'])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeReports()
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <Card padding={24}>
      {loading && (
        <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:reports.loading')}
        </div>
      )}
      {!loading && loadError && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:reports.loadError')}
        </div>
      )}
      {!loading && !loadError && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Icon name="flag" size={20} strokeWidth={2} style={{ color: 'var(--text-muted)', flex: 'none', marginTop: 2 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ font: 'var(--fw-bold) 13.5px var(--font-body)', color: 'var(--text-heading)' }}>
              {t('backoffice:reports.unavailableTitle')}
            </div>
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)', maxWidth: 560 }}>
              {t('backoffice:reports.unavailable')}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// Pondération matching (budget/lifestyle, doit sommer à 1) — édition super-admin réelle
// via PUT /api/v1/backoffice/matching-weights (service matching, `matching_weights`).
function MatchingWeightsPanel() {
  const { t } = useTranslation(['backoffice'])
  const [weights, setWeights] = useState(null)
  const [budgetPct, setBudgetPct] = useState(40)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeMatchingWeights()
      .then((data) => {
        if (cancelled) return
        setWeights(data)
        setBudgetPct(Math.round((data?.budget ?? 0.4) * 100))
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const lifestylePct = 100 - budgetPct
  const dirty = weights != null && budgetPct !== Math.round((weights.budget ?? 0.4) * 100)

  const handleSave = () => {
    setSaving(true)
    setSaveError(false)
    setSaved(false)
    updateBackofficeMatchingWeights(budgetPct / 100, lifestylePct / 100)
      .then((data) => { setWeights(data); setSaved(true) })
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false))
  }

  return (
    <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sectionTitle(t('backoffice:settings.matchingWeightsTitle'))}
      <div style={{ font: 'var(--fw-regular) 12.5px/1.5 var(--font-body)', color: 'var(--text-muted)' }}>
        {t('backoffice:settings.matchingWeightsDesc')}
      </div>
      {loading && (
        <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:settings.loading')}
        </div>
      )}
      {!loading && loadError && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:settings.loadError')}
        </div>
      )}
      {!loading && !loadError && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-heading)' }}>
              <span>{t('backoffice:settings.weightBudget')}</span>
              <span>{budgetPct}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={budgetPct}
              onChange={(e) => setBudgetPct(Number(e.target.value))}
              aria-label={t('backoffice:settings.weightBudget')}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-heading)' }}>
              <span>{t('backoffice:settings.weightLifestyle')}</span>
              <span>{lifestylePct}%</span>
            </div>
          </div>
          <div style={{ font: 'var(--fw-regular) 11.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('backoffice:settings.activeVersion', { version: weights?.version ?? '—' })}
          </div>
          {saveError && (
            <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
              {t('backoffice:settings.saveError')}
            </div>
          )}
          {saved && !dirty && (
            <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--green-700)' }}>
              {t('backoffice:settings.saveSuccess')}
            </div>
          )}
          <Button
            variant="primary" size="sm" disabled={saving || !dirty}
            onClick={handleSave}
            style={{ alignSelf: 'flex-start' }}
          >
            {saving ? t('backoffice:settings.saving') : t('backoffice:settings.save')}
          </Button>
        </>
      )}
    </Card>
  )
}

// Référentiel lifestyle (13 questions m3a) — LECTURE SEULE : module Python statique côté
// coloc-profile (`semsar_common.coloc_referential`), pas de table versionnée à éditer.
function LifestyleReferentialPanel() {
  const { t } = useTranslation(['backoffice'])
  const [referential, setReferential] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeLifestyleReferential()
      .then((data) => { if (!cancelled) setReferential(data) })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const questions = Object.entries(referential?.questions ?? {})

  return (
    <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {sectionTitle(t('backoffice:settings.lifestyleReferentialTitle'))}
        <Badge tone="neutral">{t('backoffice:settings.readOnly')}</Badge>
      </div>
      {loading && (
        <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:settings.loading')}
        </div>
      )}
      {!loading && loadError && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:settings.loadError')}
        </div>
      )}
      {!loading && !loadError && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
          {questions.map(([code, values]) => (
            <div key={code} style={{ display: 'flex', gap: 10, alignItems: 'baseline', paddingBlockEnd: 8, borderBlockEnd: '1px solid var(--border-subtle)' }}>
              <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-heading)', minWidth: 90 }}>{code}</div>
              <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{values.join(' · ')}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// Rôles & permissions — LECTURE SEULE dans cette vue : réutilise l'endpoint identity RBAC
// existant (`GET /api/v1/backoffice/roles`) ; l'édition (création/modification de rôle,
// endpoints déjà présents côté identity) n'a pas d'UI dédiée dans cette phase.
function RolesPanel() {
  const { t } = useTranslation(['backoffice'])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getBackofficeRoles()
      .then((data) => { if (!cancelled) setRoles(data?.roles ?? []) })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {sectionTitle(t('backoffice:settings.rolesTitle'))}
        <Badge tone="neutral">{t('backoffice:settings.readOnly')}</Badge>
      </div>
      {loading && (
        <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:settings.loading')}
        </div>
      )}
      {!loading && loadError && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('backoffice:settings.loadError')}
        </div>
      )}
      {!loading && !loadError && roles.length === 0 && (
        <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('backoffice:settings.rolesEmpty')}
        </div>
      )}
      {!loading && !loadError && roles.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBlockEnd: 12, borderBlockEnd: '1px solid var(--border-subtle)' }}>
          <Avatar name={r.name} size={36} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--fw-bold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{r.name}</div>
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{r.description}</div>
          </div>
          <span style={{ marginInlineStart: 'auto' }}>
            <Badge tone="navy">{t('backoffice:settings.rolesUsersCount', { count: r.users_count ?? 0 })}</Badge>
          </span>
        </div>
      ))}
    </Card>
  )
}

function SettingsView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <MatchingWeightsPanel />
        <LifestyleReferentialPanel />
      </div>
      <RolesPanel />
    </div>
  )
}

const VIEWS = {
  overview: OverviewView,
  verif: VerifView,
  listings: ListingsView,
  users: UsersView,
  contracts: ContractsView,
  reports: ReportsView,
  settings: SettingsView,
}

export default function BackOffice() {
  const { t } = useTranslation(['backoffice'])
  const [view, setView] = useState('overview')
  const navMeta = BACKOFFICE_NAV.find((n) => n.id === view) || BACKOFFICE_NAV[0]
  const title = t(`backoffice:sidebar.nav.${navMeta.id}.title`, { defaultValue: navMeta.title })
  const subtitle = t(`backoffice:sidebar.nav.${navMeta.id}.subtitle`, { defaultValue: navMeta.subtitle })
  const ViewComponent = VIEWS[view]

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr)', background: 'var(--bg-page)' }}>
      <Sidebar active={view} onSelect={setView} />
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopHeader title={title} subtitle={subtitle} />
        <div style={{ padding: '24px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <ViewComponent />
        </div>
      </main>
    </div>
  )
}
