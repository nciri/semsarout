import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { requestPasswordReset } from '../../services/index.js'
import { Button, Input } from '../../ds/index.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

export default function MotDePasseOublie() {
  const { t } = useTranslation(['web', 'common'])
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null) // null | 'success' | 'error'
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await requestPasswordReset(email)
      // Anti-énumération : le message générique s'affiche toujours en cas de succès serveur,
      // que le compte existe ou non — c'est le contrat backend.
      setStatus('success')
    } catch {
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '48px 32px' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            {t('web:auth.passwordReset.forgot.title')}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--text-body)' }}>
            {t('web:auth.passwordReset.forgot.subtitle')}
          </p>
        </div>

        {status === 'success' ? (
          <p role="status" style={{ margin: 0, color: 'var(--green-600)', font: 'var(--fw-medium) var(--fs-body) var(--font-body)' }}>
            {t('web:auth.passwordReset.forgot.genericSuccess')}
          </p>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Input
              id="email"
              label={<>{t('web:auth.passwordReset.forgot.emailLabel')}{requiredStar}</>}
              type="email"
              placeholder="prenom.nom@exemple.ma"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {status === 'error' && (
              <p role="alert" style={{ margin: 0, color: 'var(--red-600)', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>
                {t('web:auth.passwordReset.forgot.networkError')}
              </p>
            )}
            <Button type="submit" disabled={busy} fullWidth>
              {t('web:auth.passwordReset.forgot.submitCta')}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => navigate('/connexion')}
          style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--link)', cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          {t('web:auth.passwordReset.forgot.backToLogin')}
        </button>
      </div>
    </div>
  )
}
