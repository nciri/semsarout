import { useState } from 'react'
import { Avatar, Badge, Button, Card, Icon, Select, VerifiedBadge } from '../../ds/index.js'
import { blockedUsers as initialBlockedUsers, reportReasons, reportTargets, safetyTips } from '../../data/securityCenter.js'

export default function Securite() {
  const [target, setTarget] = useState(reportTargets[0].value)
  const [reason, setReason] = useState(reportReasons[0].value)
  const [details, setDetails] = useState('')
  const [blockedUsers, setBlockedUsers] = useState(initialBlockedUsers)
  const [sent, setSent] = useState(false)

  const unblock = (id) => setBlockedUsers((list) => list.filter((u) => u.id !== id))

  const submit = () => {
    setSent(true)
    setDetails('')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '34px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 26px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Centre de sécurité
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) 14.5px var(--font-body)', color: 'var(--text-body)' }}>
            Signalez un comportement suspect, gérez vos blocages, retrouvez nos conseils.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
                Faire un signalement
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-heading)' }}>
                  Que souhaitez-vous signaler ?
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {reportTargets.map((t) => {
                    const active = t.value === target
                    return (
                      <button
                        key={t.value}
                        onClick={() => setTarget(t.value)}
                        style={{
                          padding: '8px 13px',
                          borderRadius: 9,
                          border: `1.5px solid ${active ? 'var(--navy-700)' : 'var(--border-subtle)'}`,
                          background: active ? 'var(--navy-700)' : '#fff',
                          color: active ? '#fff' : 'var(--text-body)',
                          font: `${active ? 'var(--fw-bold)' : 'var(--fw-semibold)'} 13.5px var(--font-body)`,
                          cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Select label="Motif" options={reportReasons} value={reason} onChange={(e) => setReason(e.target.value)} />

              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-heading)' }}>
                  Détails (optionnel)
                </span>
                <textarea
                  rows={4}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Décrivez ce qui s'est passé…"
                  style={{
                    padding: '12px 14px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    font: 'var(--fw-regular) 14px var(--font-body)',
                    color: 'var(--text-heading)',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button variant="danger" onClick={submit}>Envoyer le signalement</Button>
                {sent && <Badge tone="verified" icon="check">Signalement envoyé</Badge>}
              </div>
            </Card>

            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
                Utilisateurs bloqués
              </div>
              {blockedUsers.length === 0 && (
                <div style={{ font: 'var(--fw-regular) 13.5px var(--font-body)', color: 'var(--text-muted)' }}>
                  Aucun utilisateur bloqué.
                </div>
              )}
              {blockedUsers.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 10,
                  }}
                >
                  <Avatar name={b.name} size={32} />
                  <div style={{ flex: 1, font: 'var(--fw-bold) 13.5px var(--font-body)', color: 'var(--text-heading)' }}>
                    {b.name}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => unblock(b.id)}>Débloquer</Button>
                </div>
              ))}
            </Card>
          </section>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--navy-50)', border: '1px solid var(--navy-100)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
                Conseils de sécurité
              </div>
              {safetyTips.map((tip) => (
                <div key={tip.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', font: 'var(--fw-regular) 13.5px/1.5 var(--font-body)', color: 'var(--text-body)' }}>
                  <Icon name="shield-check" size={15} color="var(--navy-700)" style={{ marginTop: 2, flex: 'none' }} />
                  <span>{tip.text}</span>
                </div>
              ))}
              <VerifiedBadge label="Badge « Vérifié »" level="full" size="sm" />
            </div>

            <Card padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ font: 'var(--fw-extrabold) 14px var(--font-display)', color: 'var(--text-heading)' }}>
                Besoin d&apos;aide immédiate ?
              </div>
              <div style={{ font: 'var(--fw-regular) 13px/1.5 var(--font-body)', color: 'var(--text-body)' }}>
                Notre équipe support répond sous 24h ouvrées.
              </div>
              <a href="#" style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--link)' }}>
                Contacter le support →
              </a>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  )
}
