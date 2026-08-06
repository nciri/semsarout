import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import api from '../../services/api.js'
import { Button, Card, Input } from '../../ds/index.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

function persistSession(data) {
  localStorage.setItem('auth-storage', JSON.stringify({
    state: { accessToken: data.access_token, refreshToken: data.refresh_token },
  }))
}

export default function Connexion() {
  const { t } = useTranslation(['web', 'common'])
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | register
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
      setError(err.response?.data?.error ?? t('web:auth.genericError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <Card>
        <h1 style={{ marginTop: 0, font: 'var(--fw-bold) var(--fs-h2) var(--font-display)', color: 'var(--navy-700)' }}>
          {mode === 'login' ? t('web:auth.loginTitle') : t('web:auth.registerTitle')}
        </h1>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            value={form.email}
            onChange={set('email')}
            required
          />
          <Input
            id="password"
            label={<>{t('web:auth.passwordLabel')}{requiredStar}</>}
            type="password"
            value={form.password}
            onChange={set('password')}
            required
          />
          {error && <p role="alert" style={{ color: 'var(--red-600)' }}>{error}</p>}
          <Button type="submit" disabled={busy} fullWidth>
            {mode === 'login' ? t('web:auth.loginCta') : t('web:auth.registerCta')}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', marginTop: 12,
            textDecoration: 'underline', font: 'var(--fw-regular) var(--fs-sm) var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          {mode === 'login' ? t('web:auth.switchToRegister') : t('web:auth.switchToLogin')}
        </button>
      </Card>
    </div>
  )
}
