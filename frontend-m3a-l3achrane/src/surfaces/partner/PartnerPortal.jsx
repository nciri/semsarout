import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listPartners } from '../../services/index.js'
import { Badge, Button, Icon, Input, VerifiedBadge } from '../../ds/index.js'

const SEGMENT_COUNT = 10

function Kpi({ label, value, sub }) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ font: 'var(--fw-extrabold) 24px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {sub && (
        <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{sub}</div>
      )}
    </div>
  )
}

function fillRatio(partner) {
  return partner.quota > 0 ? partner.verifies / partner.quota : 0
}

function quotaStatus(partner, t) {
  const ratio = fillRatio(partner)
  if (ratio >= 1) return { label: t('partner:portal.quotaStatus.reached'), tone: 'verified' }
  if (ratio >= 0.7) return { label: t('partner:portal.quotaStatus.onTrack'), tone: 'info' }
  return { label: t('partner:portal.quotaStatus.underQuota'), tone: 'warning' }
}

// VerifiedBadge's `level` (full | partial | none) must reflect the real verifies/quota
// ratio, not the component's "full" default — a quota of 0 shown "full" would fabricate trust.
function verifiedLevel(partner) {
  const ratio = fillRatio(partner)
  if (ratio >= 1) return 'full'
  if (ratio > 0) return 'partial'
  return 'none'
}

function groupByType(partners) {
  const byType = new Map()
  for (const p of partners) {
    const entry = byType.get(p.type) ?? { type: p.type, verifies: 0, quota: 0 }
    entry.verifies += p.verifies
    entry.quota += p.quota
    byType.set(p.type, entry)
  }
  return [...byType.values()].sort((a, b) => b.verifies - a.verifies)
}

export default function PartnerPortal() {
  const { t } = useTranslation(['partner', 'common'])
  const [partners, setPartners] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    listPartners().then(setPartners)
  }, [])

  if (!partners) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)', padding: 32 }}>{t('common:loading')}</div>
    )
  }

  const totalVerifies = partners.reduce((sum, p) => sum + p.verifies, 0)
  const totalQuota = partners.reduce((sum, p) => sum + p.quota, 0)
  const fillRate = totalQuota > 0 ? Math.round((totalVerifies / totalQuota) * 100) : 0
  const typeBreakdown = groupByType(partners)
  const attention = [...partners].sort((a, b) => fillRatio(a) - fillRatio(b)).slice(0, 3)
  const filtered = query
    ? partners.filter((p) => p.nom.toLowerCase().includes(query.toLowerCase()))
    : partners

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div
        style={{
          background: 'var(--surface-card)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '18px 28px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {t('partner:portal.kicker')}
          </div>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 23px var(--font-display)', letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
            {t('partner:portal.heading')}
          </h1>
        </div>
        <Button variant="primary" size="sm" iconLeft="upload">
          {t('partner:portal.import')}
        </Button>
      </div>

      <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Kpi label={t('partner:portal.metrics.partners')} value={partners.length} />
          <Kpi label={t('partner:portal.metrics.verified')} value={totalVerifies} />
          <Kpi label={t('partner:portal.metrics.totalQuota')} value={totalQuota} />
          <Kpi label={t('partner:portal.metrics.fillRate')} value={`${fillRate}%`} sub={t('partner:portal.metrics.fillRateSub')} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'start' }}>
          <div
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
              {t('partner:portal.breakdown.title')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {typeBreakdown.map((entry) => {
                const ratio = entry.quota > 0 ? entry.verifies / entry.quota : 0
                const filledSegments = Math.round(Math.min(ratio, 1) * SEGMENT_COUNT)
                return (
                  <div key={entry.type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 130, flex: 'none', font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-body)' }}>
                      {entry.type}
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: 9,
                            borderRadius: 2,
                            background: i < filledSegments ? 'var(--navy-700)' : 'var(--gray-150)',
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ width: 34, textAlign: 'end', font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-heading)' }}>
                      {entry.verifies}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--navy-50)', borderRadius: 'var(--radius-md)' }}>
              <Icon name="shield" size={16} color="var(--navy-600)" />
              <span style={{ font: 'var(--fw-medium) var(--fs-xs) var(--font-body)', color: 'var(--navy-700)' }}>
                {t('partner:portal.privacyBanner')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-sm)',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ font: 'var(--fw-extrabold) 14.5px var(--font-display)', color: 'var(--text-heading)' }}>
                {t('partner:portal.attention.title')}
              </div>
              {attention.map((p) => {
                const status = quotaStatus(p, t)
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ font: 'var(--fw-medium) 13.5px var(--font-body)', color: 'var(--text-body)' }}>{p.nom}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                      <span style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-heading)' }}>
                        {p.verifies}/{p.quota}
                      </span>
                      <Badge tone={status.tone} size="sm">{status.label}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>

            <div
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-sm)',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ font: 'var(--fw-extrabold) 14.5px var(--font-display)', color: 'var(--text-heading)' }}>
                {t('partner:portal.lastImport.title')}
              </div>
              <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-body)' }}>
                {t('partner:portal.lastImport.empty')}
              </div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
                {t('partner:portal.lastImport.hint')}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-heading)', margin: 0 }}>
              {t('partner:portal.tableTitle')}
            </h3>
            <div style={{ width: 240 }}>
              <Input
                icon="search"
                placeholder={t('partner:portal.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                {[t('partner:portal.table.partner'), t('partner:portal.table.type'), t('partner:portal.table.verified'), t('partner:portal.table.quota'), t('partner:portal.table.status')].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'start',
                      padding: '11px 20px',
                      font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '24px 20px', textAlign: 'center', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
                    {t('partner:portal.table.noResults')}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const status = quotaStatus(p, t)
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '13px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 'var(--radius-sm)',
                              overflow: 'hidden',
                              background: 'var(--navy-100)',
                              display: 'inline-block',
                              flex: 'none',
                            }}
                          >
                            <img src={p.logo} alt={p.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </span>
                          <span style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)' }}>
                            {p.nom}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '13px 20px' }}>
                        <Badge tone="navy">{p.type}</Badge>
                      </td>
                      <td style={{ padding: '13px 20px' }}>
                        <VerifiedBadge label={t('partner:portal.table.verifiedCount', { count: p.verifies })} level={verifiedLevel(p)} size="sm" />
                      </td>
                      <td style={{ padding: '13px 20px', font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
                        {p.quota}
                      </td>
                      <td style={{ padding: '13px 20px' }}>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
