import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, Badge, Button, Card, Chip, CompatibilityRing } from '../../ds/index.js'
import { roommateValidation } from '../../data/roommateValidation.js'

function LifestyleChips({ lifestyle }) {
  const { t } = useTranslation('app')
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {lifestyle.map((point) => (
        <Chip key={`${point.step}-${point.question}`}>
          {t(`questionnaire.steps.${point.step}.questions.${point.question}.options.${point.option}`)}
        </Chip>
      ))}
    </div>
  )
}

function CandidateActions({ statut, onValidate, onReject }) {
  const { t } = useTranslation('app')

  if (statut === 'to_validate') {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onValidate}>{t('roommateValidation.actions.validate')}</Button>
        <Button size="sm" variant="ghost" onClick={onReject}>{t('roommateValidation.actions.refuse')}</Button>
        <Button size="sm" variant="ghost">{t('roommateValidation.actions.viewProfile')}</Button>
      </div>
    )
  }

  if (statut === 'validated') {
    return <Badge tone="verified">{t('roommateValidation.statusBadge.validated')}</Badge>
  }

  if (statut === 'rejected') {
    return <Badge tone="neutral">{t('roommateValidation.statusBadge.rejected')}</Badge>
  }

  return null
}

function CandidateCard({ candidat, onSetStatus }) {
  const { t } = useTranslation('app')
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Avatar name={candidat.nom} size={42} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>
              {candidat.nom}
            </span>
            <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('roommateValidation.ageProfil', { age: candidat.age, profil: candidat.profil })}
            </span>
          </div>
          <CompatibilityRing
            value={candidat.compatibilite}
            size={76}
            stroke={7}
            label={t('roommateValidation.compatibilityLabel')}
          />
        </div>

        <LifestyleChips lifestyle={candidat.lifestyle} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
          <span style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('roommateValidation.ownerNoteLabel')}
          </span>
          <span style={{ font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)' }}>
            {candidat.noteProprietaire}
          </span>
        </div>

        <CandidateActions
          statut={candidat.statut}
          onValidate={() => onSetStatus(candidat.id, 'validated')}
          onReject={() => onSetStatus(candidat.id, 'rejected')}
        />
      </div>
    </Card>
  )
}

export default function ValidationColocataire() {
  const { t } = useTranslation('app')
  const [candidats, setCandidats] = useState(roommateValidation.candidats)
  const { logement } = roommateValidation

  const setStatus = (id, statut) => {
    setCandidats((prev) => prev.map((c) => (c.id === id ? { ...c, statut } : c)))
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) var(--fs-h1) var(--font-display)', color: 'var(--text-strong)' }}>
            {t('roommateValidation.title')}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('roommateValidation.subtitle', { titre: logement.titre, quartier: logement.quartier, ville: logement.ville })}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('roommateValidation.roomsLabel')} :
            </span>
            {logement.chambres.map((chambre) => (
              <Chip key={chambre}>{chambre}</Chip>
            ))}
          </div>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)' }}>
            {t('roommateValidation.explanation')}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {candidats.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
              {t('roommateValidation.empty')}
            </div>
          )}
          {candidats.map((candidat) => (
            <CandidateCard key={candidat.id} candidat={candidat} onSetStatus={setStatus} />
          ))}
        </div>
      </div>
    </div>
  )
}
