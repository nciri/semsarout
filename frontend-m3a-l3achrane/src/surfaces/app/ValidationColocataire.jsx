import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card } from '../../ds/index.js'
import { getPendingRoommateCandidatures, roommateDecision } from '../../services/index.js'

function CandidateActions({ status, busy, onValidate, onReject }) {
  const { t } = useTranslation('app')

  if (status === 'pending_roommate') {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onValidate} disabled={busy}>{t('roommateValidation.actions.validate')}</Button>
        <Button size="sm" variant="ghost" onClick={onReject} disabled={busy}>{t('roommateValidation.actions.refuse')}</Button>
      </div>
    )
  }

  if (status === 'accepted') {
    return <Badge tone="verified">{t('roommateValidation.statusBadge.validated')}</Badge>
  }

  if (status === 'rejected') {
    return <Badge tone="neutral">{t('roommateValidation.statusBadge.rejected')}</Badge>
  }

  return null
}

function CandidateCard({ candidature, onDecide }) {
  const { t } = useTranslation('app')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const listing = candidature.listing

  const decide = async (decision) => {
    setBusy(true)
    setError(false)
    try {
      const updated = await roommateDecision(candidature.id, decision)
      onDecide(candidature.id, updated.status)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {listing && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
            {listing.title} — {listing.neighborhood}, {listing.city}
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar name="" size={42} />
          <span style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>
            {t('candidatures.candidateLabel', { id: candidature.candidate_user_id })}
          </span>
        </div>

        {candidature.message && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
            <span style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('roommateValidation.ownerNoteLabel')}
            </span>
            <span style={{ font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)' }}>
              {candidature.message}
            </span>
          </div>
        )}

        {error && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('candidatures.actionError')}
          </div>
        )}

        <CandidateActions
          status={candidature.status}
          busy={busy}
          onValidate={() => decide('validated')}
          onReject={() => decide('rejected')}
        />
      </div>
    </Card>
  )
}

export default function ValidationColocataire() {
  const { t } = useTranslation('app')
  const [candidatures, setCandidatures] = useState(undefined) // undefined = loading
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPendingRoommateCandidatures()
      .then((rows) => { if (!cancelled) setCandidatures(rows) })
      .catch(() => { if (!cancelled) { setCandidatures([]); setLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const setStatus = (id, status) => {
    setCandidatures((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
  }

  if (candidatures === undefined) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: 48, font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
          {t('common:loading')}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) var(--fs-h1) var(--font-display)', color: 'var(--text-strong)' }}>
            {t('roommateValidation.title')}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)' }}>
            {t('roommateValidation.explanation')}
          </p>
        </div>

        {loadError && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--red-600)' }}>
            {t('candidatures.loadError')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {candidatures.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('roommateValidation.empty')}
            </div>
          )}
          {candidatures.map((candidature) => (
            <CandidateCard key={candidature.id} candidature={candidature} onDecide={setStatus} />
          ))}
        </div>
      </div>
    </div>
  )
}
