import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import api from '../../services/api.js'
import { Button, Icon, Input } from '../../ds/index.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const TRUST_FEATURE_ICONS = ['shield-check', 'percent', 'file-check']
const TRUST_FEATURE_STYLES = [
  { bg: 'rgba(43,182,115,.18)', color: 'var(--green-500)' },
  { bg: 'rgba(239,178,77,.18)', color: 'var(--gold-500)' },
  { bg: 'rgba(255,255,255,.12)', color: '#fff' },
]

function persistSession(data) {
  localStorage.setItem('auth-storage', JSON.stringify({
    state: { accessToken: data.access_token, refreshToken: data.refresh_token },
  }))
}

export default function Connexion() {
  const { t } = useTranslation(['web', 'common'])
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | register
  const [authMethod, setAuthMethod] = useState('email') // email | phone
  const [remember, setRemember] = useState(true)
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const trustFeatures = t('web:auth.trustFeatures', { returnObjects: true })

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
      setError(err.response?.data?.error ?? t('web:auth.genericError'))
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
            {t('web:auth.taglinePrefix')} <span style={{ color: 'var(--gold-500)' }}>{t('web:auth.taglineHighlight')}</span>
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {trustFeatures.map((f, i) => (
              <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', background: TRUST_FEATURE_STYLES[i].bg, color: TRUST_FEATURE_STYLES[i].color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flex: 'none',
                }}>
                  <Icon name={TRUST_FEATURE_ICONS[i]} size={16} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{f.title}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-on-navy-muted)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-on-navy-muted)' }}>{t('web:auth.dataResidencyNotice')}</div>
      </aside>

      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 32px' }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
              {mode === 'login' ? t('web:auth.loginTitle') : t('web:auth.registerTitle')}
            </h2>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--text-body)' }}>
              {mode === 'login' ? t('web:auth.noAccountPrompt') : t('web:auth.hasAccountPrompt')}
              <button
                type="button"
                onClick={toggleMode}
                style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--link)', cursor: 'pointer' }}
              >
                {mode === 'login' ? t('web:auth.registerTitle') : t('web:auth.loginCta')}
              </button>
            </p>
          </div>

          {mode === 'login' && (
            <div style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: 4, gap: 4 }}>
              {[{ key: 'email', label: t('web:auth.emailTab') }, { key: 'phone', label: t('web:auth.phoneTab') }].map((tab) => (
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
              {t('web:auth.phonePlaceholder')}
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {mode === 'register' && (
                <>
                  <Input
                    id="first_name"
                    label={<>{t('web:auth.firstNameLabel')}{requiredStar}</>}
                    value={form.first_name}
                    onChange={set('first_name')}
                    required
                  />
                  <Input
                    id="last_name"
                    label={<>{t('web:auth.lastNameLabel')}{requiredStar}</>}
                    value={form.last_name}
                    onChange={set('last_name')}
                    required
                  />
                </>
              )}
              <Input
                id="email"
                label={<>{t('web:auth.emailLabel')}{requiredStar}</>}
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
                    <span>{t('web:auth.passwordLabel')}{requiredStar}</span>
                    {mode === 'login' && (
                      <a href="#" onClick={(e) => e.preventDefault()} style={{ fontWeight: 600, fontSize: 13 }}>
                        {t('web:auth.forgotPassword')}
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
                  {t('web:auth.rememberMe')}
                </label>
              )}
              {error && <p role="alert" style={{ margin: 0, color: 'var(--red-600)', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>{error}</p>}
              <Button type="submit" disabled={busy} fullWidth>
                {mode === 'login' ? t('web:auth.loginCta') : t('web:auth.registerCta')}
              </Button>
            </form>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ height: 1, background: 'var(--border-subtle)', flex: 1 }} />
            {t('web:auth.orDivider')}
            <div style={{ height: 1, background: 'var(--border-subtle)', flex: 1 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="secondary" fullWidth>{t('web:auth.continueWithGoogle')}</Button>
            <Button variant="secondary" fullWidth>{t('web:auth.continueWithInstitution')}</Button>
          </div>

          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {t('web:auth.termsPrefix')}{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>{t('web:auth.termsLink')}</a>{' '}
            {t('web:auth.termsAnd')}{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>{t('web:auth.privacyLink')}</a>.
          </p>
        </div>
      </main>
    </div>
  )
}
