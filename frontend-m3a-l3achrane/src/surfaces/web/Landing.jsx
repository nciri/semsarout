import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Icon, Select, Tabs } from '../../ds/index.js'

const TRUST_BAND_ICONS = ['scan-face', 'badge-check', 'clipboard-check', 'lock']
const HOW_IT_WORKS_ICONS = ['user-round', 'search', 'messages-square', 'calendar-check', 'file-signature']

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
  const { t } = useTranslation('web')
  const [tab, setTab] = useState('coloc')
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)', padding: 16, maxWidth: 520 }}>
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ label: t('web:landing.searchBox.tabColoc'), value: 'coloc', icon: 'users' }, { label: t('web:landing.searchBox.tabRes'), value: 'res', icon: 'building-2' }]} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <Select label={t('web:landing.searchBox.cityLabel')} icon="map-pin" options={t('web:landing.searchBox.cities', { returnObjects: true })} />
        <Select label={t('web:landing.searchBox.budgetLabel')} icon="wallet" options={t('web:landing.searchBox.budgets', { returnObjects: true })} />
        <Button variant="primary" size="md" onClick={() => navigate('/recherche')} style={{ height: 44 }}>{t('web:landing.searchBox.cta')}</Button>
      </div>
    </div>
  )
}

export default function Landing() {
  const { t } = useTranslation('web')
  const [role, setRole] = useState('etudiant')
  const partners = t('web:landing.partnersBand.names', { returnObjects: true })
  const trustItems = t('web:landing.trustBand.items', { returnObjects: true })
  const steps = t('web:landing.howItWorks.steps', { returnObjects: true })
  return (
    <div style={{ background: 'var(--bg-page)' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(180deg,var(--navy-50),var(--bg-page))' }}>
        <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '56px 40px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <h1 style={{ font: 'var(--fw-extrabold) 52px/1.08 var(--font-display)', color: 'var(--navy-700)', letterSpacing: '-.02em', margin: '0 0 18px' }}>
              {t('web:landing.hero.titlePrefix')} <span style={{ color: 'var(--gold-500)' }}>{t('web:landing.hero.titleHighlight')}</span>
            </h1>
            <p style={{ font: 'var(--fw-regular) 18px/1.55 var(--font-body)', color: 'var(--text-body)', margin: '0 0 26px', maxWidth: 440 }}>
              {t('web:landing.hero.subtitle')}
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 26 }}>
              <Button variant={role === 'etudiant' ? 'primary' : 'secondary'} size="lg" iconLeft="graduation-cap" onClick={() => setRole('etudiant')}>{t('web:landing.hero.roleStudent')}</Button>
              <Button variant={role === 'salarie' ? 'primary' : 'secondary'} size="lg" iconLeft="briefcase" onClick={() => setRole('salarie')}>{t('web:landing.hero.roleEmployee')}</Button>
            </div>
            <SearchBox />
            <div style={{ display: 'flex', gap: 28, marginTop: 26, flexWrap: 'wrap' }}>
              <MiniTrust icon="shield-check" title={t('web:landing.hero.trust1Title')} sub={t('web:landing.hero.trust1Sub')} />
              <MiniTrust icon="git-compare-arrows" title={t('web:landing.hero.trust2Title')} sub={t('web:landing.hero.trust2Sub')} />
              <MiniTrust icon="lock" title={t('web:landing.hero.trust3Title')} sub={t('web:landing.hero.trust3Sub')} />
            </div>
          </div>
          <div style={{ position: 'relative', height: 460, borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'linear-gradient(160deg,var(--navy-300),var(--navy-600))', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.55)', flexDirection: 'column', gap: 10 }}>
              <Icon name="image" size={40} /><span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>{t('web:landing.hero.photoAlt')}</span>
            </div>
            <div style={{ position: 'absolute', insetInlineStart: 20, bottom: 20, insetInlineEnd: 20, display: 'flex', gap: 12 }}>
              <FloatCard icon="user" title={t('web:landing.hero.avatarName')} sub={t('web:landing.hero.avatarSub')} />
              <FloatCard icon="home" title={t('web:landing.hero.listingTitle')} sub={t('web:landing.hero.listingSub')} />
            </div>
          </div>
        </div>
      </div>

      {/* Trust band */}
      <Section bg="#fff" style={{ padding: '56px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ font: 'var(--fw-bold) 26px var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>{t('web:landing.trustBand.title')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
          {trustItems.map((item, i) => (
            <div key={item.title} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--navy-50)', color: 'var(--navy-700)' }}><Icon name={TRUST_BAND_ICONS[i]} size={26} strokeWidth={1.9} /></span>
              <span style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>{item.title}</span>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>{item.sub}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Eyebrow>{t('web:landing.howItWorks.eyebrow')}</Eyebrow>
          <h2 style={{ font: 'var(--fw-bold) 28px var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>{t('web:landing.howItWorks.title')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 20 }}>
          {steps.map((step, i) => (
            <div key={step.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 'var(--radius-pill)', background: 'var(--gold-100)', color: 'var(--gold-700)' }}><Icon name={HOW_IT_WORKS_ICONS[i]} size={22} /></span>
              <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-strong)' }}>{i + 1}. {step.title}</span>
              <span style={{ font: 'var(--fw-regular) var(--fs-sm)/1.45 var(--font-body)', color: 'var(--text-muted)' }}>{step.sub}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Partner logos */}
      <Section bg="#fff" style={{ padding: '48px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <span style={{ font: 'var(--fw-semibold) var(--fs-body) var(--font-display)', color: 'var(--text-muted)' }}>{t('web:landing.partnersBand.title')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
          {partners.map((p) => <span key={p} style={{ font: 'var(--fw-bold) 18px var(--font-display)', color: 'var(--gray-400)', letterSpacing: '-.01em' }}>{p}</span>)}
        </div>
      </Section>

      {/* Partner CTA */}
      <Section>
        <div style={{ background: 'var(--navy-700)', borderRadius: 'var(--radius-xl)', padding: '44px 48px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 40, alignItems: 'center', color: '#fff' }}>
          <div>
            <Eyebrow>{t('web:landing.partnerCta.eyebrow')}</Eyebrow>
            <h2 style={{ font: 'var(--fw-bold) 28px var(--font-display)', margin: '0 0 12px' }}>{t('web:landing.partnerCta.title')}</h2>
            <p style={{ font: 'var(--fw-regular) var(--fs-body-lg)/1.5 var(--font-body)', color: 'var(--text-on-navy-muted)', margin: '0 0 24px' }}>
              {t('web:landing.partnerCta.body')}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.08)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                <Icon name="graduation-cap" size={22} color="var(--gold-500)" />
                <div>
                  <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)' }}>{t('web:landing.partnerCta.universitiesTitle')}</div>
                  <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-on-navy-muted)' }}>{t('web:landing.partnerCta.universitiesSub')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.08)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                <Icon name="building-2" size={22} color="var(--gold-500)" />
                <div>
                  <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)' }}>{t('web:landing.partnerCta.companiesTitle')}</div>
                  <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-on-navy-muted)' }}>{t('web:landing.partnerCta.companiesSub')}</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ height: 200, borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', flexDirection: 'column', gap: 8 }}>
            <Icon name="bar-chart-3" size={34} /><span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)' }}>{t('web:landing.partnerCta.dashboardAlt')}</span>
          </div>
        </div>
      </Section>
    </div>
  )
}
