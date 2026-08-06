import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select } from '../../ds/index.js'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const ROLE_KEYS = ['student', 'worker', 'host']
const CURRENT_STEP = 1

export default function Inscription() {
  const { t } = useTranslation(['web', 'common'])
  const CITY_OPTIONS = t('web:registration.cityOptions', { returnObjects: true })
  const STEPS = [
    { num: 1, label: t('web:registration.steps.profile') },
    { num: 2, label: t('web:registration.steps.verification') },
    { num: 3, label: t('web:registration.steps.lifestyle') },
  ]
  const ROLES = ROLE_KEYS.map((key) => ({
    key,
    title: t(`web:registration.roles.${key}.title`),
    desc: t(`web:registration.roles.${key}.desc`),
  }))

  const [role, setRole] = useState('student')
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', city: CITY_OPTIONS[0], org: '', password: '',
  })
  const [agree, setAgree] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function submit(e) {
    e.preventDefault()
    // Câblage API à faire lors de l'intégration (étape suivante : vérification).
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '44px 24px 64px' }}>
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            {t('web:registration.title')}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--text-body)' }}>
            {t('web:registration.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {STEPS.map((step, i) => {
            const done = step.num <= CURRENT_STEP
            const barOn = step.num < CURRENT_STEP
            const isLast = i === STEPS.length - 1
            return (
              <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: isLast ? 'none' : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800,
                    background: done ? 'var(--navy-700)' : 'var(--gray-150)',
                    color: done ? '#fff' : 'var(--text-muted)',
                  }}>
                    {step.num}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: done ? 'var(--text-heading)' : 'var(--text-muted)' }}>
                    {step.label}
                  </div>
                </div>
                {!isLast && (
                  <div style={{ flex: 1, height: 2, borderRadius: 2, background: barOn ? 'var(--navy-700)' : 'var(--gray-200)' }} />
                )}
              </div>
            )
          })}
        </div>

        <section style={{
          background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 16,
          boxShadow: 'var(--shadow-sm)', padding: 28, display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{t('web:registration.iAmLabel')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {ROLES.map((r) => {
                const on = role === r.key
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRole(r.key)}
                    style={{
                      textAlign: 'start', padding: 16, borderRadius: 12, cursor: 'pointer', width: '100%', boxSizing: 'border-box',
                      display: 'flex', flexDirection: 'column', gap: 5,
                      border: `1.5px solid ${on ? 'var(--navy-700)' : 'var(--border-subtle)'}`,
                      background: on ? 'var(--navy-50)' : 'var(--white)',
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>{r.title}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>{r.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input
                id="first_name"
                label={<>{t('web:registration.form.firstNameLabel')}{requiredStar}</>}
                placeholder={t('web:registration.form.firstNamePlaceholder')}
                value={form.first_name}
                onChange={set('first_name')}
                required
              />
              <Input
                id="last_name"
                label={<>{t('web:registration.form.lastNameLabel')}{requiredStar}</>}
                placeholder={t('web:registration.form.lastNamePlaceholder')}
                value={form.last_name}
                onChange={set('last_name')}
                required
              />
              <Input
                id="email"
                label={<>{t('web:registration.form.emailLabel')}{requiredStar}</>}
                type="email"
                placeholder={t('web:registration.form.emailPlaceholder')}
                value={form.email}
                onChange={set('email')}
                required
              />
              <Input
                id="phone"
                label={<>{t('web:registration.form.phoneLabel')}{requiredStar}</>}
                placeholder={t('web:registration.form.phonePlaceholder')}
                value={form.phone}
                onChange={set('phone')}
                required
              />
              <Select
                id="city"
                label={<>{t('web:registration.form.cityLabel')}{requiredStar}</>}
                options={CITY_OPTIONS}
                value={form.city}
                onChange={set('city')}
              />
              <Input
                id="org"
                label={<>{t('web:registration.form.orgLabel')}{requiredStar}</>}
                placeholder={t('web:registration.form.orgPlaceholder')}
                value={form.org}
                onChange={set('org')}
                required
              />
            </div>

            <Input
              id="password"
              label={<>{t('web:registration.form.passwordLabel')}{requiredStar}</>}
              type="password"
              placeholder={t('web:registration.form.passwordPlaceholder')}
              hint={t('web:registration.form.passwordHint')}
              value={form.password}
              onChange={set('password')}
              required
            />

            <div style={{
              background: 'var(--navy-50)', border: '1px solid var(--navy-100)', borderRadius: 12, padding: 16,
              display: 'flex', gap: 14, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--verified-bg)', color: 'var(--verified)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none',
              }}>
                ✓
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-heading)' }}>{t('web:registration.nextStepTitle')}</div>
                <div style={{ fontSize: 13.5, color: 'var(--text-body)', lineHeight: 1.55 }}>
                  {t('web:registration.nextStepDesc')}
                </div>
              </div>
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text-body)', lineHeight: 1.55, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--navy-700)' }}
                required
              />
              <span>
                {t('web:registration.agreementPrefix')} <a href="#" onClick={(e) => e.preventDefault()}>{t('web:registration.agreementTermsLink')}</a> {t('web:registration.agreementMiddle')}{' '}
                <a href="#" onClick={(e) => e.preventDefault()}>{t('web:registration.agreementPrivacyLink')}</a> {t('web:registration.agreementSuffix')}
              </span>
            </label>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
              <Button type="button" variant="secondary">{t('web:registration.saveLaterCta')}</Button>
              <Button type="submit">{t('web:registration.continueCta')}</Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
