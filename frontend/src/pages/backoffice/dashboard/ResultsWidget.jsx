import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Kv, Rich, TD, TH } from '../components/kit'
import { useMoney } from '../components/kitTokens'
import { monthResults } from './model'

export function ResultsCompact({ closed, now }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  const r = monthResults(closed, now)
  const prevMonth = fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1), { month: 'long' })
  const [rentValue, rentUnit] = money.parts(r.wonRent.amount, 'rent')

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Kv
          label={t('dashboard.results.salesSigned')}
          value={r.wonSale.count}
          sub={r.prevWonSale.count
            ? t('dashboard.results.prevMonth', { month: prevMonth, count: r.prevWonSale.count, amount: money(r.prevWonSale.amount, 'sale') })
            : t('dashboard.results.prevMonthNone', { month: prevMonth })}
        />
        <Kv label={t('dashboard.results.rentalsSigned')} value={r.wonRent.count} sub={r.wonRent.count ? `${rentValue} ${rentUnit}` : null} />
      </div>
      {r.lostSale.amount > 0
        ? <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey="dashboard.results.lostAlert" values={{ amount: money(r.lostSale.amount, 'sale') }} /></Alert>
        : <Alert tone="plain" icon={FiCheckCircle}>{t('dashboard.results.noLoss')}</Alert>}
    </>
  )
}

export function ResultsDetail({ closed, now, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  const r = monthResults(closed, now)

  return (
    <DetailFrame
      title={t('dashboard.results.detailTitle')}
      sub={t('dashboard.results.detailSub')}
      link={{ to: '/backoffice/transactions', label: t('dashboard.results.viewAll') }}
      onClose={onClose}
      titleRef={titleRef}
    >
      <DetailColumns
        main={!closed.length ? <p className="text-sm text-gray-500">{t('dashboard.results.empty')}</p> : (
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('dashboard.results.columns.date')}</th>
              <th className={TH}>{t('dashboard.results.columns.type')}</th>
              <th className={TH}>{t('dashboard.results.columns.stage')}</th>
              <th className={TH}>{t('dashboard.results.columns.outcome')}</th>
              <th className={`${TH} text-end`}>{t('dashboard.results.columns.amount')}</th>
              <th className={TH}>{t('dashboard.results.columns.reason')}</th>
            </tr></thead>
            <tbody>
              {closed.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(c.date, { day: 'numeric', month: 'long' })}</td>
                  <td className={TD}>{t(`dashboard.results.${c.type === 'rent' ? 'rent' : 'sale'}`)}</td>
                  <td className={TD}>{t(`dashboard.stages.${c.stage}`, { defaultValue: c.stage })}</td>
                  <td className={TD}><Chip tone={c.status === 'won' ? 'good' : 'crit'}>{t(`dashboard.results.${c.status}`)}</Chip></td>
                  <td className={`${TD} whitespace-nowrap text-end font-semibold tabular-nums`}>{money(c.amount, c.type)}</td>
                  <td className={`${TD} text-gray-600`}>{c.lost_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        aside={<>
          <h3 className="font-display text-[13px] font-bold">
            {t('dashboard.results.monthToDate', { month: fmtDate(now, { month: 'long' }), day: now.getDate() })}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Kv label={t('dashboard.results.wonLabel')} value={r.won} />
            <Kv label={t('dashboard.results.lostLabel')} value={r.lost} />
          </div>
          {r.lostSale.amount > 0 && <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey="dashboard.results.lostAlert" values={{ amount: money(r.lostSale.amount, 'sale') }} /></Alert>}
        </>}
      />
    </DetailFrame>
  )
}
