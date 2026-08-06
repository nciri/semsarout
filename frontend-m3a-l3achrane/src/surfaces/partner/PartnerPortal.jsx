import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listPartners } from '../../services/index.js'
import { Badge, Button, Card, Icon, Input, VerifiedBadge } from '../../ds/index.js'

function Metric({ label, value, sub, icon }) {
  return (
    <Card style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
          {label}
        </span>
        <Icon name={icon} size={18} color="var(--gray-400)" />
      </div>
      <div style={{ font: 'var(--fw-extrabold) 30px var(--font-display)', color: 'var(--navy-700)' }}>{value}</div>
      {sub && (
        <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </Card>
  )
}

function quotaStatus(partner, t) {
  const ratio = partner.quota > 0 ? partner.verifies / partner.quota : 0
  if (ratio >= 1) return { label: t('partner:portal.quotaStatus.reached'), tone: 'verified' }
  if (ratio >= 0.7) return { label: t('partner:portal.quotaStatus.onTrack'), tone: 'info' }
  return { label: t('partner:portal.quotaStatus.underQuota'), tone: 'warning' }
}

// VerifiedBadge's `level` (full | partial | none) must reflect the real verifies/quota
// ratio, not the component's "full" default — a quota of 0 shown "full" would fabricate trust.
function verifiedLevel(partner) {
  const ratio = partner.quota > 0 ? partner.verifies / partner.quota : 0
  if (ratio >= 1) return 'full'
  if (ratio > 0) return 'partial'
  return 'none'
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

  const filtered = query
    ? partners.filter((p) => p.nom.toLowerCase().includes(query.toLowerCase()))
    : partners

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid var(--border-subtle)',
          background: '#fff',
        }}
      >
        <div>
          <div style={{ font: 'var(--fw-bold) 24px var(--font-display)', color: 'var(--navy-700)' }}>
            {t('partner:portal.title')}
          </div>
          <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)', marginTop: 2 }}>
            {t('partner:portal.subtitle')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" size="sm" iconLeft="download">
            {t('partner:portal.export')}
          </Button>
          <Button variant="primary" size="sm" iconLeft="upload">
            {t('partner:portal.import')}
          </Button>
        </div>
      </div>

      <div style={{ padding: 32 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <Metric label={t('partner:portal.metrics.partners')} value={partners.length} icon="building-2" />
          <Metric label={t('partner:portal.metrics.verified')} value={totalVerifies} icon="badge-check" />
          <Metric label={t('partner:portal.metrics.totalQuota')} value={totalQuota} icon="target" />
          <Metric label={t('partner:portal.metrics.fillRate')} value={`${fillRate}%`} icon="bar-chart-3" />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--navy-50)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 24,
          }}
        >
          <Icon name="shield" size={16} color="var(--navy-600)" />
          <span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--navy-700)' }}>
            {t('partner:portal.privacyBanner')}
          </span>
        </div>

        <div
          style={{
            background: '#fff',
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
            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', margin: 0 }}>
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
              {filtered.map((p) => {
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
                        <span style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)', color: 'var(--navy-700)' }}>
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
