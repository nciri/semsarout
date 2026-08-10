import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { resetPassword } from '../../services/index.js'
import { Button, Input } from '../../ds/index.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const MIN_PASSWORD_LENGTH = 8

export default function ReinitialiserMotDePasse() {
  const { t } = useTranslation(['web', 'common'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t('web:auth.passwordReset.reset.tooShortError'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('web:auth.passwordReset.reset.mismatchError'))
      return
    }
    setBusy(true)
    try {
      await resetPassword(token, newPassword)
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error ?? t('web:auth.passwordReset.reset.genericError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '48px 32px' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
          {t('web:auth.passwordReset.reset.title')}
        </h1>

        {!token ? (
          <p role="alert" style={{ margin: 0, color: 'var(--red-600)', font: 'var(--fw-medium) var(--fs-body) var(--font-body)' }}>
            {t('web:auth.passwordReset.reset.invalidLinkMessage')}
          </p>
        ) : success ? (
          <>
            <p role="status" style={{ margin: 0, color: 'var(--green-600)', font: 'var(--fw-medium) var(--fs-body) var(--font-body)' }}>
              {t('web:auth.passwordReset.reset.successMessage')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/connexion')}
              style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--link)', cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              {t('web:auth.passwordReset.reset.backToLogin')}
            </button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Input
              id="new_password"
              label={<>{t('web:auth.passwordReset.reset.newPasswordLabel')}{requiredStar}</>}
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              id="confirm_password"
              label={<>{t('web:auth.passwordReset.reset.confirmPasswordLabel')}{requiredStar}</>}
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {error && <p role="alert" style={{ margin: 0, color: 'var(--red-600)', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>{error}</p>}
            <Button type="submit" disabled={busy} fullWidth>
              {t('web:auth.passwordReset.reset.submitCta')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
