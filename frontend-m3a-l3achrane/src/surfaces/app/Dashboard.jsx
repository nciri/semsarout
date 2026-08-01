import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, CompatibilityRing, Icon, IconButton, ListingCard } from '../../ds/index.js'
import { getCurrentProfile, listListings } from '../../services/index.js'

const TONES = ['var(--navy-100)', 'var(--gold-100)', 'var(--green-100)']

function AppHeader({ prenom, verifiee }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid var(--border-subtle)', background: '#fff' }}>
      <div>
        <div style={{ font: 'var(--fw-bold) 24px var(--font-display)', color: 'var(--navy-700)' }}>
          Bonjour {prenom} <span style={{ fontSize: 22 }}>👋</span>
        </div>
        <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)', marginTop: 2 }}>
          Voici un aperçu de votre recherche
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <IconButton icon="bell" label="Notifications" variant="soft" round />
        <Avatar name={prenom} showLabel subtitle="Étudiant" verified={verifiee} size={38} />
      </div>
    </div>
  )
}

function StatCard({ icon, tone, label, value, sub }) {
  const c = { green: ['var(--green-50)', 'var(--green-600)'], navy: ['var(--navy-50)', 'var(--navy-700)'], gold: ['var(--gold-100)', 'var(--gold-700)'] }[tone]
  return (
    <div style={{ flex: 1, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-sm)', display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 'var(--radius-md)', background: c[0], color: c[1] }}>
        <Icon name={icon} size={23} />
      </span>
      <div>
        <div style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ font: 'var(--fw-extrabold) 22px var(--font-display)', color: 'var(--text-strong)' }}>{value}</div>
        <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: c[1] }}>{sub}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [recs, setRecs] = useState(null)

  useEffect(() => {
    getCurrentProfile().then(setProfile)
    listListings().then((all) => setRecs(all.slice(0, 3)))
  }, [])

  if (!profile || !recs) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)', padding: 48, font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
        Chargement…
      </div>
    )
  }

  const matches = recs.map((l) => l.matchPct).filter((m) => m != null)
  const avgMatch = matches.length ? Math.round(matches.reduce((s, m) => s + m, 0) / matches.length) : null

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <AppHeader prenom={profile.prenom} verifiee={profile.verifiee} />
      <div style={{ padding: 32 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 26 }}>
          <StatCard
            icon="badge-check"
            tone={profile.verifiee ? 'green' : 'gold'}
            label="Profil vérifié"
            value={profile.verifiee ? 'Vérifié' : 'En attente'}
            sub="CIN + statut"
          />
          <StatCard icon="git-compare-arrows" tone="navy" label="Compatibilité moyenne" value={avgMatch != null ? `${avgMatch}%` : '—'} sub={avgMatch != null ? 'Excellent' : 'Bientôt disponible'} />
          <StatCard icon="file-text" tone="gold" label="Candidatures" value="3" sub="En cours" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ font: 'var(--fw-bold) var(--fs-h2) var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>Recommandations pour vous</h2>
          <a href="#" style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)' }}>Voir tout</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 28 }}>
          {recs.map((it, i) => (
            <ListingCard
              key={it.id}
              image={it.photos?.[0]}
              imageTone={TONES[i % TONES.length]}
              match={it.matchPct}
              verified={it.verifiee}
              title={it.titre}
              city={`${it.quartier}, ${it.ville}`}
              price={it.prixMad}
              amenities={it.chips?.map((label) => ({ icon: 'check', label }))}
              onClick={() => navigate(`/annonce/${it.id}`)}
            />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', margin: '0 0 14px' }}>Activité récente</h3>
            {[['eye', 'Votre candidature a été vue par Sarah', 'var(--navy-50)', 'var(--navy-700)'], ['message-circle', 'Nouveau message de Youssef', 'var(--info-100)', 'var(--info-500)'], ['file-signature', 'Contrat prêt à être signé', 'var(--gold-100)', 'var(--gold-700)']].map(([ic, t, bg, fg], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: bg, color: fg }}>
                  <Icon name={ic} size={17} />
                </span>
                <span style={{ font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', margin: '0 0 14px' }}>Prochaine étape</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--gold-100)', color: 'var(--gold-700)', flex: 'none' }}>
                <Icon name="calendar-check" size={21} />
              </span>
              <div>
                <div style={{ font: 'var(--fw-semibold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>Visite planifiée</div>
                <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)', margin: '2px 0' }}>Samedi 24 mai à 10:00 · Agdal, Rabat</div>
                <a href="#" style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)' }}>Voir le détail</a>
              </div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {avgMatch != null && <CompatibilityRing value={avgMatch} size={120} stroke={10} label="Compatibilité moyenne" />}
          </div>
        </div>
      </div>
    </div>
  )
}
