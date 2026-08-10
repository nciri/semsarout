import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPartnerMe, getPartnerReporting, listAffilies } from '../../services/index.js'
import { Badge, Button, Icon, Input } from '../../ds/index.js'
import { PartnerAccessRequired, PartnerKpi } from './PartnerSection.jsx'
import { isForbiddenError } from './access.js'

const SEGMENT_COUNT = 10
const AFFILIE_STATUS_ORDER = ['ACTIVE', 'PENDING', 'INACTIVE']
const AFFILIATE_STATUS_TONE = { actif: 'verified', suspendu: 'danger', enAttente: 'warning' }

const money = (v) => `${Number(v ?? 0).toLocaleString('fr-MA')} Đh`

export default function PartnerPortal() {
  const { t } = useTranslation(['partner', 'common'])
  const [reporting, setReporting] = useState(undefined) // undefined = loading
  const [me, setMe] = useState(null)
  const [affiliates, setAffiliates] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setReporting(undefined)
    setLoadError(false)
    setForbidden(false)
    Promise.all([getPartnerReporting(), getPartnerMe(), listAffilies()])
      .then(([rep, meRes, affs]) => {
        if (cancelled) return
        setReporting(rep)
        setMe(meRes)
        setAffiliates(affs)
      })
      .catch((err) => {
        if (cancelled) return
        if (isForbiddenError(err)) setForbidden(true)
        else setLoadError(true)
      })
    return () => { cancelled = true }
  }, [])

  if (forbidden) {
    return (
      <PartnerAccessRequired
        title={t('partner:accessRequired.title')}
        description={t('partner:accessRequired.description')}
      />
    )
  }

  if (reporting === undefined) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)', padding: 32 }}>{t('common:loading')}</div>
    )
  }

  if (loadError) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)', padding: 32 }}>
        <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--red-600)' }}>
          {t('partner:portal.loadError')}
        </div>
      </div>
    )
  }

  const partnerName = me?.name ?? me?.nom
  const affiliesByStatus = reporting.affilies.by_status
  const filtered = query
    ? affiliates.filter((a) => (a.full_name ?? a.nom ?? '').toLowerCase().includes(query.toLowerCase()))
    : affiliates

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
            {partnerName ? t('partner:portal.headingWithName', { name: partnerName }) : t('partner:portal.heading')}
          </h1>
        </div>
        <Button variant="primary" size="sm" iconLeft="upload">
          {t('partner:portal.import')}
        </Button>
      </div>

      <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <PartnerKpi label={t('partner:reporting.kpis.totalAffilies')} value={reporting.affilies.total} />
          <PartnerKpi label={t('partner:reporting.kpis.activeAffilies')} value={affiliesByStatus.ACTIVE ?? 0} />
          <PartnerKpi label={t('partner:reporting.kpis.grantsTotalAmount')} value={money(reporting.grants.total_amount)} />
          <PartnerKpi label={t('partner:reporting.kpis.invoicesOutstanding')} value={money(reporting.invoices.outstanding_amount)} />
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
              {AFFILIE_STATUS_ORDER.map((status) => {
                const count = affiliesByStatus[status] ?? 0
                const ratio = reporting.affilies.total > 0 ? count / reporting.affilies.total : 0
                const filledSegments = Math.round(Math.min(ratio, 1) * SEGMENT_COUNT)
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 130, flex: 'none', font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-body)' }}>
                      {t(`partner:reporting.affilieStatus.${status}`)}
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
                      {count}
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
                {t('partner:portal.billingSummary.title')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ font: 'var(--fw-medium) 13.5px var(--font-body)', color: 'var(--text-body)' }}>
                  {t('partner:portal.billingSummary.outstanding')}
                </span>
                <span style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-heading)' }}>
                  {money(reporting.invoices.outstanding_amount)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ font: 'var(--fw-medium) 13.5px var(--font-body)', color: 'var(--text-body)' }}>
                  {t('partner:portal.billingSummary.paid')}
                </span>
                <span style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-heading)' }}>
                  {money(reporting.invoices.paid_amount)}
                </span>
              </div>
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
                {[t('partner:affiliates.table.name'), t('partner:affiliates.table.email'), t('partner:affiliates.table.status')].map((h) => (
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
                  <td colSpan={3} style={{ padding: '24px 20px', textAlign: 'center', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
                    {t('partner:portal.table.noResults')}
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '13px 20px', font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)' }}>
                      {a.full_name ?? a.nom}
                    </td>
                    <td style={{ padding: '13px 20px', font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
                      {a.email ?? '—'}
                    </td>
                    <td style={{ padding: '13px 20px' }}>
                      <Badge tone={AFFILIATE_STATUS_TONE[a.statut]}>{t(`partner:affiliates.status.${a.statut}`)}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
