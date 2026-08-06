import { useState } from 'react'
import { Badge, Button, Card, Icon, Input, PriceTag } from '../../ds/index.js'
import { paiementSequestre } from '../../data/paiementSequestre.js'

const STATUT_STYLE = {
  fait: { background: 'var(--green-500)', color: '#fff' },
  en_cours: { background: 'var(--navy-700)', color: '#fff' },
  attente: { background: 'var(--gray-150)', color: 'var(--text-muted)' },
}

function EtapeSequestre({ etape, isLast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: isLast ? 'none' : 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: 'var(--fw-extrabold) var(--fs-sm) var(--font-display)',
            ...STATUT_STYLE[etape.statut],
          }}
        >
          {etape.mark}
        </div>
        <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', color: 'var(--text-heading)', textAlign: 'center', maxWidth: 90 }}>
          {etape.label}
        </div>
      </div>
      {!isLast && (
        <div
          style={{
            flex: 1,
            height: 2,
            background: etape.statut === 'fait' ? 'var(--green-500)' : 'var(--gray-200)',
            margin: '0 6px 22px',
          }}
        />
      )}
    </div>
  )
}

export default function Paiement() {
  const { annonce, etapes, lignes, total } = paiementSequestre
  const [mode, setMode] = useState('carte')
  const [confirmeEspeces, setConfirmeEspeces] = useState(false)

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '34px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 26px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Sécuriser votre place
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>
            {annonce.titre} · Entrée le {annonce.entree}
          </p>
        </div>

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
            Statut du séquestre
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {etapes.map((etape, i) => (
              <EtapeSequestre key={etape.id} etape={etape} isLast={i === etapes.length - 1} />
            ))}
          </div>
          <div
            style={{
              background: 'var(--navy-50)',
              border: '1px solid var(--navy-100)',
              borderRadius: 10,
              padding: '14px 16px',
              font: 'var(--fw-regular) var(--fs-sm) var(--font-body)',
              color: 'var(--text-body)',
              lineHeight: 1.55,
            }}
          >
            Les fonds sont conservés sous séquestre et libérés au propriétaire uniquement après confirmation de
            l’état des lieux d’entrée, ou à l’expiration du délai de rétractation.
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
              Détail du montant
            </div>
            {lignes.map((ligne) => (
              <div key={ligne.label} style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>
                <span>{ligne.label}</span>
                <PriceTag amount={ligne.montant} period={null} size="sm" />
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
                Total à sécuriser
              </span>
              <PriceTag amount={total} period={null} size="md" />
            </div>
          </Card>

          <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
              Mode de paiement
            </div>
            <div style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 9, padding: 4, gap: 4 }}>
              <button
                onClick={() => setMode('carte')}
                style={{
                  flex: 1,
                  padding: 9,
                  border: 0,
                  borderRadius: 6,
                  background: mode === 'carte' ? 'var(--white)' : 'transparent',
                  color: mode === 'carte' ? 'var(--text-heading)' : 'var(--text-muted)',
                  font: `${mode === 'carte' ? 'var(--fw-bold)' : 'var(--fw-semibold)'} 13.5px var(--font-body)`,
                  boxShadow: mode === 'carte' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                }}
              >
                Carte (CMI)
              </button>
              <button
                onClick={() => setMode('especes')}
                style={{
                  flex: 1,
                  padding: 9,
                  border: 0,
                  borderRadius: 6,
                  background: mode === 'especes' ? 'var(--white)' : 'transparent',
                  color: mode === 'especes' ? 'var(--text-heading)' : 'var(--text-muted)',
                  font: `${mode === 'especes' ? 'var(--fw-bold)' : 'var(--fw-semibold)'} 13.5px var(--font-body)`,
                  boxShadow: mode === 'especes' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                }}
              >
                Espèces
              </button>
            </div>

            {mode === 'carte' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Input placeholder="Numéro de carte" icon="credit-card" autoComplete="off" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <Input placeholder="MM/AA" containerStyle={{ flex: 1 }} autoComplete="off" />
                  <Input placeholder="CVC" containerStyle={{ flex: 1 }} autoComplete="off" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
                  <Icon name="shield-check" size={14} />
                  Paiement sécurisé par CMI — aucune donnée de carte n’est stockée sur la plateforme.
                </div>
                <Button variant="accent" fullWidth>
                  Payer {new Intl.NumberFormat('fr-MA').format(total).replace(/[\u202f,]/g, ' ')} MAD
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)', lineHeight: 1.55 }}>
                  Le propriétaire déclare l’encaissement en espèces ; vous confirmez ensuite pour recevoir une
                  quittance numérique. Aucun montant ne transite par la plateforme.
                </p>
                {confirmeEspeces && (
                  <Badge tone="verified" icon="check">Réception confirmée — quittance envoyée</Badge>
                )}
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={confirmeEspeces}
                  onClick={() => setConfirmeEspeces(true)}
                  style={{ borderColor: 'var(--navy-700)', background: 'var(--navy-50)', color: 'var(--navy-700)' }}
                >
                  {confirmeEspeces ? 'Réception confirmée' : "Confirmer la réception de l'encaissement"}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
