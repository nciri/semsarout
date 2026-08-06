import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, CompatibilityRing, Icon, IconButton, ListingCard } from '../../ds/index.js'
import { getCurrentProfile, listListings } from '../../services/index.js'

const TONES = ['var(--navy-100)', 'var(--gold-100)', 'var(--green-100)']

function AppHeader({ prenom, verifiee, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid var(--border-subtle)', background: '#fff' }}>
      <div>
        <div style={{ font: 'var(--fw-bold) 24px var(--font-display)', color: 'var(--navy-700)' }}>
          {t('app:dashboard.greeting', { prenom })} <span style={{ fontSize: 22 }}>👋</span>
        </div>
        <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)', marginTop: 2 }}>
          {t('app:dashboard.subtitle')}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <IconButton icon="bell" label={t('app:dashboard.notifications')} variant="soft" round />
        <Avatar name={prenom} showLabel subtitle={t('app:dashboard.studentSubtitle')} verified={verifiee} size={38} />
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
  const { t } = useTranslation(['app', 'common'])
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
        {t('common:loading')}
      </div>
    )
  }

  const matches = recs.map((l) => l.matchPct).filter((m) => m != null)
  const avgMatch = matches.length ? Math.round(matches.reduce((s, m) => s + m, 0) / matches.length) : null

  const activity = [
    ['eye', t('app:dashboard.activityViewedBy', { name: 'Sarah' }), 'var(--navy-50)', 'var(--navy-700)'],
    ['message-circle', t('app:dashboard.activityNewMessage', { name: 'Youssef' }), 'var(--info-100)', 'var(--info-500)'],
    ['file-signature', t('app:dashboard.activityContractReady'), 'var(--gold-100)', 'var(--gold-700)'],
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <AppHeader prenom={profile.prenom} verifiee={profile.verifiee} t={t} />
      <div style={{ padding: 32 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 26 }}>
          <StatCard
            icon="badge-check"
            tone={profile.verifiee ? 'green' : 'gold'}
            label={t('app:dashboard.stats.verifiedProfileLabel')}
            value={profile.verifiee ? t('app:dashboard.stats.verifiedProfileValueVerified') : t('app:dashboard.stats.verifiedProfileValuePending')}
            sub={t('app:dashboard.stats.verifiedProfileSub')}
          />
          <StatCard
            icon="git-compare-arrows"
            tone="navy"
            label={t('app:dashboard.stats.avgCompatibilityLabel')}
            value={avgMatch != null ? `${avgMatch}%` : '—'}
            sub={avgMatch != null ? t('app:dashboard.stats.avgCompatibilitySubExcellent') : t('app:dashboard.stats.avgCompatibilitySubSoon')}
          />
          <StatCard icon="file-text" tone="gold" label={t('app:dashboard.stats.applicationsLabel')} value="3" sub={t('app:dashboard.stats.applicationsSub')} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ font: 'var(--fw-bold) var(--fs-h2) var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>{t('app:dashboard.recommendationsTitle')}</h2>
          <a href="#" style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)' }}>{t('app:dashboard.seeAll')}</a>
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
            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', margin: '0 0 14px' }}>{t('app:dashboard.activityTitle')}</h3>
            {activity.map(([ic, label, bg, fg], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: bg, color: fg }}>
                  <Icon name={ic} size={17} />
                </span>
                <span style={{ font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', margin: '0 0 14px' }}>{t('app:dashboard.nextStepTitle')}</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--gold-100)', color: 'var(--gold-700)', flex: 'none' }}>
                <Icon name="calendar-check" size={21} />
              </span>
              <div>
                <div style={{ font: 'var(--fw-semibold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>{t('app:dashboard.nextStepVisitScheduled')}</div>
                <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)', margin: '2px 0' }}>{t('app:dashboard.nextStepVisitDetails')}</div>
                <a href="#" style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)' }}>{t('app:dashboard.nextStepViewDetail')}</a>
              </div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {avgMatch != null && <CompatibilityRing value={avgMatch} size={120} stroke={10} label={t('app:dashboard.stats.avgCompatibilityLabel')} />}
          </div>
        </div>
      </div>
    </div>
  )
}
