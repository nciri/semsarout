import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, Chip, Input } from '../../ds/index.js'
import {
  acceptCandidature, createLease, createOrOpenConversation, getReceivedCandidatures,
  rejectCandidature, shortlistCandidature,
} from '../../services/index.js'

const todayIso = () => new Date().toISOString().slice(0, 10)

// Formulaire de génération de bail — pré-rempli (loyer/caution/date) depuis l'annonce de
// la candidature acceptée, éditable avant création. N'appelle `createLease` (POST /leases)
// que sur soumission.
function GenerateLeaseForm({ app, onCreated }) {
  const { t } = useTranslation(['app', 'common'])
  const [rentAmount, setRentAmount] = useState(String(app.listing?.rent ?? ''))
  const [depositAmount, setDepositAmount] = useState(String(app.listing?.deposit ?? ''))
  const [startDate, setStartDate] = useState(todayIso())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    setError(false)
    try {
      const lease = await createLease({
        listingId: app.listing_id,
        tenantUserId: app.candidate_user_id,
        rentAmount: Number(rentAmount),
        depositAmount: Number(depositAmount),
        startDate,
      })
      onCreated(lease.id)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)' }}>
      <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--navy-700)' }}>
        {t('app:candidatures.generateLeaseFormTitle')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Input label={t('app:candidatures.rentLabel')} type="number" value={rentAmount}
               onChange={(e) => setRentAmount(e.target.value)} />
        <Input label={t('app:candidatures.depositLabel')} type="number" value={depositAmount}
               onChange={(e) => setDepositAmount(e.target.value)} />
        <Input label={t('app:candidatures.startDateLabel')} type="date" value={startDate}
               onChange={(e) => setStartDate(e.target.value)} />
      </div>
      {error && (
        <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
          {t('app:candidatures.generateLeaseError')}
        </div>
      )}
      <div>
        <Button size="sm" onClick={submit} disabled={submitting || !rentAmount || !depositAmount || !startDate}>
          {submitting ? t('app:candidatures.generateLeaseSubmitting') : t('app:candidatures.generateLeaseSubmit')}
        </Button>
      </div>
    </div>
  )
}

function buildFilters(t) {
  return [
    { value: 'all', label: t('app:candidatures.filters.all') },
    { value: 'received', label: t('app:candidatures.filters.received') },
    { value: 'shortlisted', label: t('app:candidatures.filters.shortlisted') },
    { value: 'pending_roommate', label: t('app:candidatures.filters.pendingRoommate') },
    { value: 'accepted', label: t('app:candidatures.filters.accepted') },
    { value: 'rejected', label: t('app:candidatures.filters.refused') },
  ]
}

// Colocataires en place : agrégat non nominatif côté serveur (total/femmes/hommes,
// aucune identité) — on affiche donc un compte, jamais de noms inventés.
function RoommatesInPlace({ total }) {
  const { t } = useTranslation(['app', 'common'])
  if (!total) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex' }}>
        {Array.from({ length: Math.min(total, 4) }).map((_, i) => (
          <span
            key={i}
            style={{
              marginInlineStart: i === 0 ? 0 : -8,
              border: '2px solid var(--surface-page, #fff)',
              borderRadius: 'var(--radius-pill)',
              display: 'block',
            }}
          >
            <Avatar name="" size={26} />
          </span>
        ))}
      </div>
      <span style={{ font: 'var(--fw-medium) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
        {t('app:candidatures.roommatesInPlace', { count: total })}
      </span>
    </div>
  )
}

function ApplicationActions({ app, onShortlist, onAccept, onRefuse, busy }) {
  const { t } = useTranslation(['app', 'common'])

  if (app.status === 'received') {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onShortlist} disabled={busy}>{t('app:candidatures.actions.shortlist')}</Button>
        <Button size="sm" variant="ghost" onClick={onRefuse} disabled={busy}>{t('app:candidatures.actions.refuse')}</Button>
      </div>
    )
  }

  if (app.status === 'shortlisted') {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onAccept} disabled={busy}>
          {app.listing?.room_already_occupied ? t('app:candidatures.actions.share') : t('app:candidatures.actions.validate')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRefuse} disabled={busy}>{t('app:candidatures.actions.refuse')}</Button>
      </div>
    )
  }

  if (app.status === 'pending_roommate') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Badge tone="warning">{t('app:candidatures.statusBadge.pendingRoommate')}</Badge>
        <RoommatesInPlace total={app.listing?.roommates?.total} />
      </div>
    )
  }

  if (app.status === 'accepted') {
    return <Badge tone="verified">{t('app:candidatures.statusBadge.accepted')}</Badge>
  }

  if (app.status === 'rejected') {
    return <Badge tone="neutral">{t('app:candidatures.statusBadge.refused')}</Badge>
  }

  return null
}

function ApplicationCard({ app, onSetStatus, onLeaseCreated, leaseId }) {
  const { t } = useTranslation(['app', 'common'])
  const navigate = useNavigate()
  const [showLeaseForm, setShowLeaseForm] = useState(false)
  const [contacting, setContacting] = useState(false)
  const [contactError, setContactError] = useState(false)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState(false)
  const listing = app.listing

  const contact = async () => {
    setContacting(true)
    setContactError(false)
    try {
      const { id } = await createOrOpenConversation({
        otherUserId: app.candidate_user_id, contextType: 'listing', listingId: app.listing_id,
      })
      navigate(`/espace/messages?conversation=${id}`)
    } catch {
      setContactError(true)
    } finally {
      setContacting(false)
    }
  }

  const runAction = async (action) => {
    setActing(true)
    setActionError(false)
    try {
      const updated = await action(app.id)
      onSetStatus(app.id, updated.status)
    } catch {
      setActionError(true)
    } finally {
      setActing(false)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {listing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
              {listing.title} — {listing.neighborhood}, {listing.city}
            </div>
            {listing.room_already_occupied && <RoommatesInPlace total={listing.roommates?.total} />}
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Avatar name="" size={42} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>
                {t('app:candidatures.candidateLabel', { id: app.candidate_user_id })}
              </span>
              <span style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
                {new Date(app.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <Button size="sm" variant="ghost" onClick={contact} disabled={contacting}>
              {t('app:messaging.contact')}
            </Button>
            {contactError && (
              <span style={{ font: 'var(--fw-medium) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
                {t('app:messaging.contactError')}
              </span>
            )}
          </div>
        </div>

        {app.message && (
          <div style={{ font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
            {app.message}
          </div>
        )}

        {app.status === 'accepted' && (
          leaseId ? (
            <Badge tone="verified" icon="check">
              {t('app:candidatures.leaseGenerated', { id: leaseId })}
            </Badge>
          ) : showLeaseForm ? (
            <GenerateLeaseForm app={app} onCreated={(id) => { onLeaseCreated(app.id, id); setShowLeaseForm(false) }} />
          ) : (
            <div>
              <Button size="sm" variant="secondary" onClick={() => setShowLeaseForm(true)}>
                {t('app:candidatures.generateLeaseButton')}
              </Button>
            </div>
          )
        )}

        {actionError && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('app:candidatures.actionError')}
          </div>
        )}

        <ApplicationActions
          app={app}
          busy={acting}
          onShortlist={() => runAction(shortlistCandidature)}
          onAccept={() => runAction(acceptCandidature)}
          onRefuse={() => runAction(rejectCandidature)}
        />
      </div>
    </Card>
  )
}

export default function Candidatures() {
  const { t } = useTranslation(['app', 'common'])
  const FILTERS = buildFilters(t)
  const [applications, setApplications] = useState(undefined) // undefined = loading
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState('all')
  const [leaseIds, setLeaseIds] = useState({})

  useEffect(() => {
    let cancelled = false
    setApplications(undefined)
    setLoadError(false)
    getReceivedCandidatures()
      .then((rows) => { if (!cancelled) setApplications(rows) })
      .catch(() => { if (!cancelled) { setApplications([]); setLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const setStatus = (id, status) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }
  const markLeaseCreated = (id, leaseId) => {
    setLeaseIds((prev) => ({ ...prev, [id]: leaseId }))
  }

  if (applications === undefined) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
          {t('common:loading')}
        </div>
      </div>
    )
  }

  const counts = applications.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    { all: applications.length },
  )
  const visible = applications.filter((a) => filter === 'all' || a.status === filter)

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) var(--fs-h1) var(--font-display)', color: 'var(--text-strong)' }}>
            {t('app:candidatures.title')}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
            {t('app:candidatures.subtitle')}
          </p>
        </div>

        {loadError && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--red-600)' }}>
            {t('app:candidatures.loadError')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label} ({counts[f.value] ?? 0})
            </Chip>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visible.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('app:candidatures.empty')}
            </div>
          )}
          {visible.map((app) => (
            <ApplicationCard key={app.id} app={app} leaseId={leaseIds[app.id]}
                             onSetStatus={setStatus} onLeaseCreated={markLeaseCreated} />
          ))}
        </div>
      </div>
    </div>
  )
}
