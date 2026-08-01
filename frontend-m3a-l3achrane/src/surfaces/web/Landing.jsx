import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Icon, Select, Tabs } from '../../ds/index.js'

const PARTNERS = ['UM6P', 'Univ. Mohammed V', 'INPT', 'OFPPT', 'Maroc Telecom', 'Société Générale']

function Section({ children, bg, style }) {
  return (
    <section style={{ padding: '72px 40px', background: bg || 'transparent', ...style }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto' }}>{children}</div>
    </section>
  )
}

function Eyebrow({ children }) {
  return (
    <div style={{ font: 'var(--fw-bold) var(--fs-xs) var(--font-body)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold-600)', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function MiniTrust({ icon, title, sub }) {
  return (
    <div style={{ display: 'flex', gap: 10, maxWidth: 200 }}>
      <Icon name={icon} size={22} color="var(--navy-700)" strokeWidth={2} />
      <div>
        <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-strong)' }}>{title}</div>
        <div style={{ font: 'var(--fw-regular) var(--fs-xs)/1.4 var(--font-body)', color: 'var(--text-muted)' }}>{sub}</div>
      </div>
    </div>
  )
}

function FloatCard({ icon, title, sub }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,.96)', borderRadius: 'var(--radius-md)', padding: '10px 12px', boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--navy-50)', color: 'var(--navy-700)' }}>
        <Icon name={icon} size={17} />
      </span>
      <div>
        <div style={{ font: 'var(--fw-bold) var(--fs-xs) var(--font-display)', color: 'var(--text-strong)' }}>{title}</div>
        <div style={{ font: 'var(--fw-regular) 10px var(--font-body)', color: 'var(--text-muted)' }}>{sub}</div>
      </div>
    </div>
  )
}

function SearchBox() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('coloc')
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)', padding: 16, maxWidth: 520 }}>
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ label: 'Colocations', value: 'coloc', icon: 'users' }, { label: 'Résidences', value: 'res', icon: 'building-2' }]} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <Select label="Ville ou quartier" icon="map-pin" options={['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir']} />
        <Select label="Budget max" icon="wallet" options={['1 500 MAD', '2 500 MAD', '4 000 MAD']} />
        <Button variant="primary" size="md" onClick={() => navigate('/recherche')} style={{ height: 44 }}>Rechercher</Button>
      </div>
    </div>
  )
}

export default function Landing() {
  const [role, setRole] = useState('etudiant')
  return (
    <div style={{ background: 'var(--bg-page)' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(180deg,var(--navy-50),var(--bg-page))' }}>
        <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '56px 40px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <h1 style={{ font: 'var(--fw-extrabold) 52px/1.08 var(--font-display)', color: 'var(--navy-700)', letterSpacing: '-.02em', margin: '0 0 18px' }}>
              Trouvez votre colocation idéale en toute <span style={{ color: 'var(--gold-500)' }}>confiance</span>
            </h1>
            <p style={{ font: 'var(--fw-regular) 18px/1.55 var(--font-body)', color: 'var(--text-body)', margin: '0 0 26px', maxWidth: 440 }}>
              La plateforme de colocation vérifiée pour étudiants et jeunes actifs au Maroc.
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 26 }}>
              <Button variant={role === 'etudiant' ? 'primary' : 'secondary'} size="lg" iconLeft="graduation-cap" onClick={() => setRole('etudiant')}>Je suis étudiant</Button>
              <Button variant={role === 'salarie' ? 'primary' : 'secondary'} size="lg" iconLeft="briefcase" onClick={() => setRole('salarie')}>Je suis salarié</Button>
            </div>
            <SearchBox />
            <div style={{ display: 'flex', gap: 28, marginTop: 26, flexWrap: 'wrap' }}>
              <MiniTrust icon="shield-check" title="Profils vérifiés" sub="CIN, statut étudiant ou employeur" />
              <MiniTrust icon="git-compare-arrows" title="Compatibilité intelligente" sub="Plus qu'un prix, un mode de vie" />
              <MiniTrust icon="lock" title="Paiement sécurisé" sub="Caution et premier loyer sous séquestre" />
            </div>
          </div>
          <div style={{ position: 'relative', height: 460, borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'linear-gradient(160deg,var(--navy-300),var(--navy-600))', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.55)', flexDirection: 'column', gap: 10 }}>
              <Icon name="image" size={40} /><span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>Photo — ville marocaine</span>
            </div>
            <div style={{ position: 'absolute', left: 20, bottom: 20, right: 20, display: 'flex', gap: 12 }}>
              <FloatCard icon="user" title="Salma, 19 ans" sub="Colocataire · Rabat" />
              <FloatCard icon="home" title="F4 · Agdal" sub="85% compatible" />
            </div>
          </div>
        </div>
      </div>

      {/* Trust band */}
      <Section bg="#fff" style={{ padding: '56px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ font: 'var(--fw-bold) 26px var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>La confiance, au cœur de M3a-L3chrane</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
          {[['scan-face', 'Identité vérifiée', 'CIN vérifiée'], ['badge-check', 'Statut vérifié', 'Étudiant ou employé'], ['clipboard-check', 'Annonces modérées', 'Contrôle qualité'], ['lock', 'Paiement sécurisé', "Séquestre jusqu'à l'état des lieux"]].map(([ic, t, s]) => (
            <div key={t} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--navy-50)', color: 'var(--navy-700)' }}><Icon name={ic} size={26} strokeWidth={1.9} /></span>
              <span style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>{t}</span>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Eyebrow>Comment ça marche</Eyebrow>
          <h2 style={{ font: 'var(--fw-bold) 28px var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>Cinq étapes, en toute sérénité</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 20 }}>
          {[['user-round', 'Créez votre profil', "Vérification d'identité et de statut"], ['search', 'Recherchez & filtrez', 'Trouvez les colocations compatibles'], ['messages-square', 'Échangez', 'Discutez en toute sécurité'], ['calendar-check', 'Visitez & choisissez', 'Rencontrez vos futurs colocataires'], ['file-signature', 'Signez & emménagez', 'Contrat en ligne, paiement sécurisé']].map(([ic, t, s], i) => (
            <div key={t} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 'var(--radius-pill)', background: 'var(--gold-100)', color: 'var(--gold-700)' }}><Icon name={ic} size={22} /></span>
              <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-strong)' }}>{i + 1}. {t}</span>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm)/1.45 var(--font-body)', color: 'var(--text-muted)' }}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Partner logos */}
      <Section bg="#fff" style={{ padding: '48px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <span style={{ font: 'var(--fw-semibold) var(--fs-body) var(--font-display)', color: 'var(--text-muted)' }}>Ils nous font confiance</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
          {PARTNERS.map((p) => <span key={p} style={{ font: 'var(--fw-bold) 18px var(--font-display)', color: 'var(--gray-400)', letterSpacing: '-.01em' }}>{p}</span>)}
        </div>
      </Section>

      {/* Partner CTA */}
      <Section>
        <div style={{ background: 'var(--navy-700)', borderRadius: 'var(--radius-xl)', padding: '44px 48px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 40, alignItems: 'center', color: '#fff' }}>
          <div>
            <Eyebrow>Partenaires institutions</Eyebrow>
            <h2 style={{ font: 'var(--fw-bold) 28px var(--font-display)', margin: '0 0 12px' }}>Des portails dédiés et des intégrations API</h2>
            <p style={{ font: 'var(--fw-regular) var(--fs-body-lg)/1.5 var(--font-body)', color: 'var(--text-on-navy-muted)', margin: '0 0 24px' }}>
              Pour accompagner vos étudiants et vos collaborateurs, avec un reporting anonymisé et un référentiel vérifié.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.08)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                <Icon name="graduation-cap" size={22} color="var(--gold-500)" />
                <div>
                  <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)' }}>Portail Universités</div>
                  <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-on-navy-muted)' }}>Gérez le logement de vos étudiants</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.08)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                <Icon name="building-2" size={22} color="var(--gold-500)" />
                <div>
                  <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)' }}>Portail Entreprises</div>
                  <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-on-navy-muted)' }}>Relocation de vos nouveaux talents</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ height: 200, borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', flexDirection: 'column', gap: 8 }}>
            <Icon name="bar-chart-3" size={34} /><span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>Tableau de bord partenaire</span>
          </div>
        </div>
      </Section>
    </div>
  )
}
