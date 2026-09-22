import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, Kv, Legend, Rich, SegBar, TD, TH } from '../components/kit'
import { useMoney } from '../components/kitTokens'
import { contactRate, listingInsights, portfolioBuckets } from './model'

const COLORS = { active: '#0F766E', pending: '#6BB5AC', draft: '#C3E2DD', closed: '#D9D5CD' }

export function PortfolioCompact({ listings }) {
  const { t } = useTranslation('backoffice')
  const b = portfolioBuckets(listings?.by_status)
  const ins = listingInsights(listings?.active)
  if (!b.total) return <p className="text-sm text-gray-500">{t('dashboard.portfolio.empty')}</p>

  return (
    <>
      <Figure value={b.active}>{t('dashboard.portfolio.online', { sale: ins.sale, rent: ins.rent })}</Figure>
      <div className="grid gap-2">
        <SegBar label={t('dashboard.portfolio.statusLabel', b)}
          parts={['active', 'pending', 'draft', 'closed'].map((k) => ({ value: b[k], color: COLORS[k] }))} />
        <Legend items={['active', 'pending', 'draft', 'closed'].map((k) => ({ color: COLORS[k], label: `${t(`dashboard.portfolio.status.${k}`)} ${b[k]}` }))} />
      </div>
      {ins.zero.length > 0
        ? <Alert tone="warn" icon={FiAlertTriangle}><Rich i18nKey="dashboard.portfolio.zeroAlert" values={{ count: ins.zero.length, title: ins.zero[0].title }} /></Alert>
        : b.active > 0 && <Alert tone="plain" icon={FiCheckCircle}>{t('dashboard.portfolio.allContacted')}</Alert>}
    </>
  )
}

export function PortfolioDetail({ listings, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtNumber } = useFormat()
  const money = useMoney()
  const b = portfolioBuckets(listings?.by_status)
  const ins = listingInsights(listings?.active)
  const maxR = Math.max(0.0001, ...ins.ranked.map(contactRate))

  return (
    <DetailFrame
      title={t('dashboard.portfolio.title')}
      sub={t('dashboard.portfolio.detailSub', { count: b.active })}
      link={{ to: '/backoffice/biens', label: t('dashboard.portfolio.viewAll') }}
      onClose={onClose}
      titleRef={titleRef}
    >
      <DetailColumns
        main={!ins.ranked.length ? <p className="text-sm text-gray-500">{t('dashboard.portfolio.empty')}</p> : (
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('dashboard.portfolio.columns.listing')}</th>
              <th className={`${TH} text-end`}>{t('dashboard.portfolio.columns.price')}</th>
              <th className={`${TH} text-end`}>{t('dashboard.portfolio.columns.views')}</th>
              <th className={`${TH} text-end`}>{t('dashboard.portfolio.columns.contacts')}</th>
              <th className={`${TH} min-w-[150px]`}>{t('dashboard.portfolio.columns.rate')}</th>
            </tr></thead>
            <tbody>
              {ins.ranked.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className={TD}><b className="font-semibold">{l.title}</b><span className="block text-xs text-gray-500">{l.city}</span></td>
                  <td className={`${TD} whitespace-nowrap text-end tabular-nums`}>{l.price != null ? money(l.price, l.transaction_type) : '—'}</td>
                  <td className={`${TD} text-end tabular-nums`}>{fmtNumber(l.views)}</td>
                  <td className={`${TD} text-end tabular-nums`}>{l.contacts || <Chip tone="warn">0</Chip>}</td>
                  <td className={TD}>
                    <div className="grid grid-cols-[1fr_52px] items-center gap-2">
                      <span className="h-2 overflow-hidden rounded bg-gray-100"><i className="block h-full rounded bg-emerald-600" style={{ width: `${(contactRate(l) / maxR) * 100}%` }} /></span>
                      <span className="text-[12.5px] tabular-nums">{fmtNumber(contactRate(l) * 100, { maximumFractionDigits: 1 })} %</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        aside={<>
          <h3 className="font-display text-[13px] font-bold">{t('dashboard.portfolio.breakdown', { count: b.total })}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Kv label={t('dashboard.portfolio.status.active')} value={b.active} />
            <Kv label={t('dashboard.portfolio.status.pending')} value={b.pending} />
            <Kv label={t('dashboard.portfolio.rented')} value={b.rented} />
            <Kv label={t('dashboard.portfolio.sold')} value={b.sold} />
          </div>
          {ins.zero.length > 0 && <Alert tone="warn" icon={FiAlertTriangle}><Rich i18nKey="dashboard.portfolio.zeroDetail" values={{ count: ins.zero.length, views: fmtNumber(ins.zeroViews) }} /></Alert>}
        </>}
      />
    </DetailFrame>
  )
}
