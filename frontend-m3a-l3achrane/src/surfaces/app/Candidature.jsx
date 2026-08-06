import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Chip, Icon } from '../../ds/index.js'
import { applicationHost, applicationListing, applicationMatch, applicationSlots } from '../../data/applicationForm.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

export default function Candidature() {
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
              Candidature envoyée
            </h1>
            <p style={{ margin: 0, maxWidth: 440, fontSize: 14.5, color: 'var(--text-body)', lineHeight: 1.6 }}>
              {applicationHost.nom} a été notifiée. Vous recevrez une réponse sous 48h — suivez son statut dans vos candidatures ou continuez la conversation.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link to="/espace/messages">
                <Button variant="secondary">Voir la conversation</Button>
              </Link>
              <Link to="/espace">
                <Button variant="primary">Continuer la recherche</Button>
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
              Postuler pour cette chambre
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: 'var(--text-body)' }}>
              {applicationListing.titre} — {applicationListing.quartier}, {applicationListing.ville} · {applicationListing.prixMad.toLocaleString('fr-FR')} MAD/mois
            </p>
          </div>

          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 14,
            padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green-700)' }}>
              {applicationMatch.pct}% de compatibilité avec ce logement
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-body)', lineHeight: 1.55 }}>
              {applicationMatch.raisons.join(' · ')}
            </div>
          </div>

          <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)' }}>
                Message au·à la colocataire{requiredStar}
              </span>
              <textarea
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Présentez-vous en quelques lignes : votre situation, vos disponibilités, pourquoi ce logement vous intéresse…"
                style={{
                  padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 8,
                  fontSize: 14, fontFamily: 'inherit', color: 'var(--text-heading)', outline: 'none', resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)' }}>
                Créneaux de visite qui vous conviennent
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
                Votre profil est vérifié et votre questionnaire de mode de vie est complet — le·la propriétaire verra votre score de compatibilité dès réception.
              </div>
            </div>

            <div style={{ alignSelf: 'flex-end' }}>
              <Button variant="accent" size="lg" onClick={submit} disabled={!message.trim()}>
                Envoyer ma candidature
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
