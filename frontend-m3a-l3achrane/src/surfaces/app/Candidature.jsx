import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Icon } from '../../ds/index.js'
import { applicationHost, applicationListing, applicationMatch, applicationSlots } from '../../data/applicationForm.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

export default function Candidature() {
  const { t } = useTranslation(['app', 'common'])
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState('')
  const [slots, setSlots] = useState(applicationSlots)

  const toggleSlot = (id) => {
    setSlots((list) => list.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)))
  }

  const submit = () => {
    if (!message.trim()) return
    setSent(true)
  }

  if (sent) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'var(--green-100)', color: 'var(--green-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', font: 'var(--fw-bold) 30px var(--font-display)',
            }}>
              ✓
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
              {t('app:candidature.sentTitle')}
            </h1>
            <p style={{ margin: 0, maxWidth: 440, fontSize: 14.5, color: 'var(--text-body)', lineHeight: 1.6 }}>
              {t('app:candidature.sentMessage', { host: applicationHost.nom })}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link to="/espace/messages">
                <Button variant="secondary">{t('app:candidature.viewConversation')}</Button>
              </Link>
              <Link to="/espace">
                <Button variant="primary">{t('app:candidature.continueSearch')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 24px 64px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
              {t('app:candidature.title')}
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: 'var(--text-body)' }}>
              {t('app:candidature.listingSubtitle', {
                titre: applicationListing.titre,
                quartier: applicationListing.quartier,
                ville: applicationListing.ville,
                prix: applicationListing.prixMad.toLocaleString('fr-FR'),
              })}
            </p>
          </div>

          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 14,
            padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green-700)' }}>
              {t('app:candidature.matchTitle', { pct: applicationMatch.pct })}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-body)', lineHeight: 1.55 }}>
              {applicationMatch.raisons.join(' · ')}
            </div>
          </div>

          <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)' }}>
                {t('app:candidature.messageLabel')}{requiredStar}
              </span>
              <textarea
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('app:candidature.messagePlaceholder')}
                style={{
                  padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 8,
                  fontSize: 14, fontFamily: 'inherit', color: 'var(--text-heading)', outline: 'none', resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)' }}>
                {t('app:candidature.slotsLabel')}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {slots.map((s) => (
                  <Chip key={s.id} selected={s.selected} onClick={() => toggleSlot(s.id)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px',
              borderRadius: 10, background: 'var(--navy-50)',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--verified-bg, var(--green-100))',
                color: 'var(--verified, var(--green-700))', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flex: 'none',
              }}>
                <Icon name="shield-check" size={16} strokeWidth={2.4} />
              </span>
              <div style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.55 }}>
                {t('app:candidature.verifiedNotice')}
              </div>
            </div>

            <div style={{ alignSelf: 'flex-end' }}>
              <Button variant="accent" size="lg" onClick={submit} disabled={!message.trim()}>
                {t('app:candidature.submit')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
