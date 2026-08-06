import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, Chip, MatchScore } from '../../ds/index.js'
import { applicationsInbox } from '../../data/applicationsInbox.js'

function buildFilters(t) {
  return [
    { value: 'all', label: t('app:candidatures.filters.all') },
    { value: 'pending', label: t('app:candidatures.filters.pending') },
    { value: 'accepted', label: t('app:candidatures.filters.accepted') },
    { value: 'waiting', label: t('app:candidatures.filters.waiting') },
  ]
}

function ApplicationActions({ app, onAccept, onWait, onRefuse }) {
  const { t } = useTranslation(['app', 'common'])
  if (app.statut === 'pending') {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onAccept}>{t('app:candidatures.actions.accept')}</Button>
        <Button size="sm" variant="secondary" onClick={onWait}>{t('app:candidatures.actions.wait')}</Button>
        <Button size="sm" variant="ghost" onClick={onRefuse}>{t('app:candidatures.actions.refuse')}</Button>
      </div>
    )
  }
  if (app.statut === 'waiting') {
    return (
      <Badge tone="warning">{t('app:candidatures.statusBadge.waiting')}</Badge>
    )
  }
  if (app.statut === 'refused') {
    return (
      <Badge tone="neutral">{t('app:candidatures.statusBadge.refused')}</Badge>
    )
  }
  return null
}

function ApplicationCard({ app, slots, onSetStatus, onPickSlot }) {
  const { t } = useTranslation(['app', 'common'])
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          onAccept={() => onSetStatus(app.id, 'accepted')}
          onWait={() => onSetStatus(app.id, 'waiting')}
          onRefuse={() => onSetStatus(app.id, 'refused')}
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
  const { listing, slots } = applicationsInbox

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
            {listing.titre} — {listing.quartier}, {listing.ville}
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
