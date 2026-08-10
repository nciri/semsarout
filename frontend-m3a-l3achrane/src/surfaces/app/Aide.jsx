import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Icon, Input } from '../../ds/index.js'

const FAQ_IDS = ['publierAnnonce', 'preselection', 'paiementCaution', 'securiteSignalement']

export default function Aide() {
  const { t } = useTranslation(['app', 'common'])
  const [openFaq, setOpenFaq] = useState(FAQ_IDS[0])
  const [subject, setSubject] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    setSent(true)
    setSubject('')
    setEmail('')
    setMessage('')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '34px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 26px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            {t('app:aide.title')}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) 14.5px var(--font-body)', color: 'var(--text-body)' }}>
            {t('app:aide.subtitle')}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)', marginBottom: 8 }}>
                {t('app:aide.faqTitle')}
              </div>
              {FAQ_IDS.map((id) => {
                const open = openFaq === id
                return (
                  <div key={id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => setOpenFaq(open ? null : id)}
                      aria-expanded={open}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        width: '100%', padding: '14px 2px', background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'start', font: 'var(--fw-bold) 14px var(--font-body)', color: 'var(--text-heading)',
                      }}
                    >
                      <span>{t(`app:aide.faq.${id}.question`)}</span>
                      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} color="var(--text-muted)" style={{ flex: 'none' }} />
                    </button>
                    {open && (
                      <p style={{ margin: '0 0 14px', font: 'var(--fw-regular) 13.5px/1.6 var(--font-body)', color: 'var(--text-body)' }}>
                        {t(`app:aide.faq.${id}.answer`)}
                      </p>
                    )}
                  </div>
                )
              })}
            </Card>
          </section>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card id="contact" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
                  {t('app:aide.contactTitle')}
                </div>
                <div style={{ font: 'var(--fw-regular) 13px/1.5 var(--font-body)', color: 'var(--text-body)' }}>
                  {t('app:aide.contactText')}
                </div>
              </div>

              {sent ? (
                <Badge tone="verified" icon="check">{t('app:aide.contactSent')}</Badge>
              ) : (
                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Input
                    label={t('app:aide.subjectLabel')}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('app:aide.subjectPlaceholder')}
                    required
                  />
                  <Input
                    label={t('app:aide.emailLabel')}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('app:aide.emailPlaceholder')}
                  />
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ font: 'var(--fw-semibold) 13px var(--font-body)', color: 'var(--text-strong)' }}>
                      {t('app:aide.messageLabel')}
                    </span>
                    <textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t('app:aide.messagePlaceholder')}
                      required
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
                  <Button type="submit" variant="primary">{t('app:aide.submitContact')}</Button>
                </form>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </div>
  )
}
