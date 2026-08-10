import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPartnerReporting } from '../../services/index.js'
import { PartnerAccessRequired, PartnerCard, PartnerKpi, PartnerScreen } from './PartnerSection.jsx'
import { isForbiddenError } from './access.js'
import { BarChart } from './charts.jsx'

const money = (v) => `${Number(v ?? 0).toLocaleString('fr-MA')} Đh`
const pct = (v) => `${Math.round(v * 100)}%`

function FunnelStep({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: tone, flex: 'none' }} aria-hidden />
      <span style={{ flex: 1, font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-body)' }}>{label}</span>
      <span style={{ font: 'var(--fw-bold) 14px var(--font-body)', color: 'var(--text-heading)' }}>{value}</span>
    </div>
  )
}

export default function Reporting() {
  const { t } = useTranslation(['partner', 'common'])
  const [data, setData] = useState(undefined) // undefined = loading
  const [loadError, setLoadError] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    setData(undefined)
    setLoadError(false)
    setForbidden(false)
    getPartnerReporting()
      .then((res) => { if (!cancelled) setData(res) })
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

  return (
    <PartnerScreen kicker={t('partner:reporting.kicker')} heading={t('partner:reporting.heading')}>
      {loadError && (
        <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
          {t('partner:reporting.loadError')}
        </div>
      )}
      {data === undefined ? (
        <div style={{ padding: '24px 0', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
          {t('common:loading')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <PartnerKpi label={t('partner:reporting.kpis.totalAffilies')} value={data.affilies.total} />
            <PartnerKpi label={t('partner:reporting.kpis.activeAffilies')} value={data.affilies.by_status.ACTIVE ?? 0} />
            <PartnerKpi label={t('partner:reporting.kpis.grantsTotalAmount')} value={money(data.grants.total_amount)} />
            <PartnerKpi label={t('partner:reporting.kpis.invoicesOutstanding')} value={money(data.invoices.outstanding_amount)} />
          </div>

          <PartnerCard title={t('partner:reporting.funnel.title')}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FunnelStep label={t('partner:reporting.funnel.pending')} value={data.verifications.pending} tone="var(--gray-400)" />
              <FunnelStep label={t('partner:reporting.funnel.approved')} value={data.verifications.approved} tone="var(--green-500)" />
              <FunnelStep label={t('partner:reporting.funnel.rejected')} value={data.verifications.rejected} tone="var(--red-500)" />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 10,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ font: 'var(--fw-semibold) 13px var(--font-body)', color: 'var(--text-body)' }}>
                  {t('partner:reporting.funnel.approvalRate')}
                </span>
                <span style={{ font: 'var(--fw-extrabold) 15px var(--font-display)', color: 'var(--text-heading)' }}>
                  {data.verifications.approval_rate == null
                    ? t('partner:reporting.funnel.noDecisions')
                    : pct(data.verifications.approval_rate)}
                </span>
              </div>
            </div>
          </PartnerCard>

          <PartnerCard title={t('partner:reporting.chart.title')}>
            <div style={{ padding: '18px 20px' }}>
              <BarChart
                title={t('partner:reporting.chart.title')}
                ariaLabel={t('partner:reporting.chart.ariaLabel')}
                data={[
                  {
                    key: 'active',
                    label: t('partner:reporting.chart.active'),
                    value: data.reservations.active,
                    colorVar: 'var(--navy-600)',
                  },
                  {
                    key: 'released',
                    label: t('partner:reporting.chart.released'),
                    value: data.reservations.released,
                    colorVar: 'var(--gray-400)',
                  },
                ]}
              />
            </div>
          </PartnerCard>
        </>
      )}
    </PartnerScreen>
  )
}
