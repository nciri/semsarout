import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '../../services/api.js'
import { Button, Input } from '../../ds/index.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const TRUST_FEATURES = [
  { icon: '✓', bg: 'rgba(43,182,115,.18)', color: 'var(--green-500)', title: 'Profils vérifiés', desc: 'CIN, statut étudiant ou employeur' },
  { icon: '%', bg: 'rgba(239,178,77,.18)', color: 'var(--gold-500)', title: 'Compatibilité mesurée', desc: 'Un score de mode de vie, pas un hasard' },
  { icon: '§', bg: 'rgba(255,255,255,.12)', color: '#fff', title: 'Un cadre clair pour tous', desc: 'Contrat signé en ligne, dépôt sécurisé' },
]

function persistSession(data) {
  localStorage.setItem('auth-storage', JSON.stringify({
    state: { accessToken: data.access_token, refreshToken: data.refresh_token },
  }))
}

export default function Connexion() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | register
  const [authMethod, setAuthMethod] = useState('email') // email | phone
  const [remember, setRemember] = useState(true)
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register'
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : form
      const { data } = await api.post(path, payload)
      persistSession(data)
      navigate('/espace')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Connexion impossible — réessayez.')
    } finally {
      setBusy(false)
    }
  }

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(null)
  }

  const showPhonePlaceholder = mode === 'login' && authMethod === 'phone'

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', background: 'var(--bg-page)' }}>
      <aside style={{
        background: 'var(--surface-navy)', color: 'var(--text-on-navy)', padding: '56px 64px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 48,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ font: 'var(--fw-extrabold) 22px var(--font-display)', letterSpacing: '-0.02em' }}>M3a-L3chrane</div>
          <div style={{ fontSize: 15, color: 'var(--text-on-navy-muted)' }}>مع العشران</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 420 }}>
          <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.03em' }}>
            Retrouvez votre colocation, <span style={{ color: 'var(--gold-500)' }}>en toute confiance</span>.
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {TRUST_FEATURES.map((f) => (
              <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', background: f.bg, color: f.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flex: 'none',
                }}>
                  {f.icon}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{f.title}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-on-navy-muted)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-on-navy-muted)' }}>Données hébergées au Maroc — conforme CNDP</div>
      </aside>

      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 32px' }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
              {mode === 'login' ? 'Se connecter' : 'Créer un compte'}
            </h2>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--text-body)' }}>
              {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
              <button
                type="button"
                onClick={toggleMode}
                style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--link)', cursor: 'pointer' }}
              >
                {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
              </button>
            </p>
          </div>

          {mode === 'login' && (
            <div style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: 4, gap: 4 }}>
              {[{ key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Téléphone' }].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAuthMethod(tab.key)}
                  style={{
                    flex: 1, padding: 9, border: 0, borderRadius: 6, cursor: 'pointer',
                    background: authMethod === tab.key ? '#fff' : 'transparent',
                    color: authMethod === tab.key ? 'var(--text-heading)' : 'var(--text-muted)',
                    fontSize: 14, fontWeight: authMethod === tab.key ? 700 : 600,
                    boxShadow: authMethod === tab.key ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {showPhonePlaceholder ? (
            <div style={{ padding: '32px 0', textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
              Connexion par téléphone bientôt disponible.
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {mode === 'register' && (
                <>
                  <Input
                    id="first_name"
                    label={<>Prénom{requiredStar}</>}
                    value={form.first_name}
                    onChange={set('first_name')}
                    required
                  />
                  <Input
                    id="last_name"
                    label={<>Nom{requiredStar}</>}
                    value={form.last_name}
                    onChange={set('last_name')}
                    required
                  />
                </>
              )}
              <Input
                id="email"
                label={<>Adresse e-mail{requiredStar}</>}
                type="email"
                placeholder="prenom.nom@exemple.ma"
                value={form.email}
                onChange={set('email')}
                required
              />
              <Input
                id="password"
                label={(
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Mot de passe{requiredStar}</span>
                    {mode === 'login' && (
                      <a href="#" onClick={(e) => e.preventDefault()} style={{ fontWeight: 600, fontSize: 13 }}>
                        Mot de passe oublié ?
                      </a>
                    )}
                  </span>
                )}
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                required
              />
              {mode === 'login' && (
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--navy-700)' }}
                  />
                  Rester connecté sur cet appareil
                </label>
              )}
              {error && <p role="alert" style={{ margin: 0, color: 'var(--red-600)', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>{error}</p>}
              <Button type="submit" disabled={busy} fullWidth>
                {mode === 'login' ? 'Se connecter' : "S'inscrire"}
              </Button>
            </form>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ height: 1, background: 'var(--border-subtle)', flex: 1 }} />
            ou
            <div style={{ height: 1, background: 'var(--border-subtle)', flex: 1 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="secondary" fullWidth>Continuer avec Google</Button>
            <Button variant="secondary" fullWidth>Continuer avec mon établissement</Button>
          </div>

          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            En continuant, vous acceptez nos{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>conditions d&apos;utilisation</a>{' '}
            et notre <a href="#" onClick={(e) => e.preventDefault()}>politique de confidentialité</a>.
          </p>
        </div>
      </main>
    </div>
  )
}
