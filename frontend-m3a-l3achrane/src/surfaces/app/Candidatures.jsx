import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, Chip, MatchScore } from '../../ds/index.js'
import { applicationsInbox } from '../../data/applicationsInbox.js'

function buildFilters(t) {
  return [
    { value: 'all', label: t('app:candidatures.filters.all') },
    { value: 'received', label: t('app:candidatures.filters.received') },
    { value: 'shortlisted', label: t('app:candidatures.filters.shortlisted') },
    { value: 'pending_roommate', label: t('app:candidatures.filters.pendingRoommate') },
    { value: 'accepted', label: t('app:candidatures.filters.accepted') },
    { value: 'refused', label: t('app:candidatures.filters.refused') },
  ]
}

function RoommatesInPlace({ colocataires }) {
  const { t } = useTranslation(['app', 'common'])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex' }}>
        {colocataires.map((c, i) => (
          <span
            key={c.nom}
            style={{
              marginInlineStart: i === 0 ? 0 : -8,
              border: '2px solid var(--surface-page, #fff)',
              borderRadius: 'var(--radius-pill)',
              display: 'block',
            }}
          >
            <Avatar name={c.nom} size={26} />
          </span>
        ))}
      </div>
      <span style={{ font: 'var(--fw-medium) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
        {t('app:candidatures.roommatesInPlace')}
      </span>
    </div>
  )
}

function ApplicationActions({ app, onShortlist, onShare, onValidate, onRefuse, onMarkRoommateValidated }) {
  const { t } = useTranslation(['app', 'common'])

  if (app.statut === 'received') {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onShortlist}>{t('app:candidatures.actions.shortlist')}</Button>
        <Button size="sm" variant="ghost" onClick={onRefuse}>{t('app:candidatures.actions.refuse')}</Button>
      </div>
    )
  }

  if (app.statut === 'shortlisted') {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {app.annonce.chambreDejaLouee ? (
          <Button size="sm" onClick={onShare}>{t('app:candidatures.actions.share')}</Button>
        ) : (
          <Button size="sm" onClick={onValidate}>{t('app:candidatures.actions.validate')}</Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRefuse}>{t('app:candidatures.actions.refuse')}</Button>
      </div>
    )
  }

  if (app.statut === 'pending_roommate') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Badge tone="warning">{t('app:candidatures.statusBadge.pendingRoommate')}</Badge>
        <RoommatesInPlace colocataires={app.annonce.colocataires} />
        <div>
          <Button size="sm" variant="secondary" onClick={onMarkRoommateValidated}>
            {t('app:candidatures.actions.markRoommateValidated')}
          </Button>
        </div>
      </div>
    )
  }

  if (app.statut === 'accepted') {
    return <Badge tone="verified">{t('app:candidatures.statusBadge.accepted')}</Badge>
  }

  if (app.statut === 'refused') {
    return <Badge tone="neutral">{t('app:candidatures.statusBadge.refused')}</Badge>
  }

  return null
}

function ApplicationCard({ app, slots, onSetStatus, onPickSlot }) {
  const { t } = useTranslation(['app', 'common'])
  const { annonce } = app
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
            {annonce.titre} — {annonce.quartier}, {annonce.ville}
          </div>
          {annonce.chambreDejaLouee && <RoommatesInPlace colocataires={annonce.colocataires} />}
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Avatar name={app.nom} size={42} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>{app.nom}</span>
              <span style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>{app.recue}</span>
            </div>
            <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>{app.profil}</div>
          </div>
          <MatchScore value={app.score} />
        </div>

        <div style={{ font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
          {app.message}
        </div>

        {app.statut === 'accepted' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)' }}>
            <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--navy-700)' }}>
              {t('app:candidatures.acceptedPickSlot')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {slots.map((s) => (
                <Chip key={s.id} selected={app.slotId === s.id} onClick={() => onPickSlot(app.id, s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <ApplicationActions
          app={app}
          onShortlist={() => onSetStatus(app.id, 'shortlisted')}
          onShare={() => onSetStatus(app.id, 'pending_roommate')}
          onValidate={() => onSetStatus(app.id, 'accepted')}
          onRefuse={() => onSetStatus(app.id, 'refused')}
          onMarkRoommateValidated={() => onSetStatus(app.id, 'accepted')}
        />
      </div>
    </Card>
  )
}

export default function Candidatures() {
  const { t } = useTranslation(['app', 'common'])
  const FILTERS = buildFilters(t)
  const [applications, setApplications] = useState(applicationsInbox.applications)
  const [filter, setFilter] = useState('all')
  const { slots } = applicationsInbox

  const setStatus = (id, statut) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, statut } : a)))
  }
  const pickSlot = (id, slotId) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, slotId } : a)))
  }

  const counts = applications.reduce(
    (acc, a) => ({ ...acc, [a.statut]: (acc[a.statut] ?? 0) + 1 }),
    { all: applications.length },
  )
  const visible = applications.filter((a) => filter === 'all' || a.statut === filter)

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
            <ApplicationCard key={app.id} app={app} slots={slots} onSetStatus={setStatus} onPickSlot={pickSlot} />
          ))}
        </div>
      </div>
    </div>
  )
}
