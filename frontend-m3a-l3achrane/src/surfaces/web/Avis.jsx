import { useState } from 'react'
import { Button, Card, Avatar, Icon } from '../../ds/index.js'
import { stayContext, reviewCriteria, receivedReviews, pendingReviewsCount, pendingReviewsDelayDays } from '../../data/reviews.js'

function StarPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          style={{
            width: 34, height: 34, border: 0, background: 'transparent',
            fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
            color: n <= value ? 'var(--gold-500)' : 'var(--gray-200)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function Avis() {
  const [scores, setScores] = useState(() =>
    Object.fromEntries(reviewCriteria.map((c) => [c.key, c.initial])),
  )
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = () => {
    setSubmitted(true)
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 24px 64px', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, font: 'var(--fw-bold) 26px/1.2 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
          Évaluer votre séjour
        </h1>
        <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>
          Avec {stayContext.partnerName} — {stayContext.listingTitle} · terminé le {stayContext.endedDate}
        </p>
      </div>

      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--navy-50)',
        border: '1px solid var(--navy-100)', borderRadius: 12, padding: '14px 16px',
        font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)',
      }}>
        <Icon name="info" size={16} color="var(--navy-600)" style={{ marginTop: 2, flex: 'none' }} />
        <span>
          Votre évaluation ne sera publiée que lorsque les deux parties auront évalué — ou automatiquement 14 jours
          après la fin du séjour.
        </span>
      </div>

      <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {reviewCriteria.map((c) => (
          <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>{c.label}</div>
            <StarPicker
              value={scores[c.key]}
              onChange={(n) => setScores((s) => ({ ...s, [c.key]: n }))}
            />
          </div>
        ))}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
            Commentaire (visible après publication)
          </span>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Décrivez votre expérience de cohabitation…"
            style={{
              padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 8,
              font: 'var(--fw-regular) var(--fs-body) var(--font-body)', outline: 'none', resize: 'vertical',
            }}
          />
        </label>

        <Button variant="accent" onClick={submit} style={{ alignSelf: 'flex-start' }}>
          {submitted ? 'Évaluation envoyée' : 'Publier mon évaluation'}
        </Button>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ font: 'var(--fw-bold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
          Vos évaluations reçues
        </div>

        {receivedReviews.map((r) => (
          <Card key={r.id} padding={0} style={{ padding: '16px 18px', display: 'flex', gap: 14 }}>
            <Avatar name={r.name} size={38} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)' }}>{r.name}</span>
                <span style={{ color: 'var(--gold-500)', font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', flex: 'none' }}>
                  {'★'.repeat(r.stars)}
                </span>
              </div>
              <div style={{ font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)' }}>{r.text}</div>
              <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>{r.date}</div>
            </div>
          </Card>
        ))}

        {pendingReviewsCount > 0 && (
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px',
            border: '1px dashed var(--border-default)', borderRadius: 12,
            font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)',
          }}>
            <Icon name="clock" size={16} style={{ flex: 'none' }} />
            {pendingReviewsCount} évaluation{pendingReviewsCount > 1 ? 's' : ''} en attente de publication — visible
            {pendingReviewsCount > 1 ? 's' : ''} dans {pendingReviewsDelayDays} jours ou dès que l&apos;autre partie aura évalué.
          </div>
        )}
      </div>
    </div>
  )
}
