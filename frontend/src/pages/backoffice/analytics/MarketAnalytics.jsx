import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import BarsChart from '../../../components/analytics/BarsChart'
import DonutChart from '../../../components/analytics/DonutChart'
import { fmtMAD, fmtNum, fmtPct } from '../../../components/analytics/palette'

function MarketAnalytics() {
  const { t } = useTranslation(['backoffice'])
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'market', filters], () => analyticsService.getMarket(filters))
  if (isLoading) return <p>{t('backoffice:analytics.shared.loading')}</p>
  if (isError || !data) return <p className="text-gray-500">{t('backoffice:analytics.shared.noData')}</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label={t('backoffice:analytics.market.kpis.portfolioPriceSqm')} value={fmtMAD(s.portfolio_avg_price_sqm)} />
        <KpiTile label={t('backoffice:analytics.market.kpis.marketPriceSqm')} value={fmtMAD(s.market_avg_price_sqm)} />
        <KpiTile label={t('backoffice:analytics.market.kpis.gapVsMarket')} value={fmtPct(s.price_gap_pct)} tone={s.price_gap_pct > 0 ? 'up' : 'down'} />
        <KpiTile label={t('backoffice:analytics.market.kpis.daysOnMarket')} value={fmtNum(s.avg_days_on_market)} />
      </div>
      <ChartCard title={t('backoffice:analytics.market.charts.priceSqmByNeighborhood')} empty={!d.price_sqm_by_neighborhood?.length}>
        <BarsChart data={d.price_sqm_by_neighborhood} xKey="area"
                   bars={[{ key: 'portfolio', name: t('backoffice:analytics.market.series.portfolio') }, { key: 'market', name: t('backoffice:analytics.market.series.market') }]} />
      </ChartCard>
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title={t('backoffice:analytics.market.charts.daysOnMarket')} empty={!d.days_on_market_distribution?.length}>
          <BarsChart data={d.days_on_market_distribution} xKey="bucket" bars={[{ key: 'count', name: t('backoffice:analytics.market.series.listings') }]} />
        </ChartCard>
        <ChartCard title={t('backoffice:analytics.market.charts.valuationByCity')} empty={!d.portfolio_valuation_by_city?.length}>
          <DonutChart data={d.portfolio_valuation_by_city} nameKey="city" valueKey="value" />
        </ChartCard>
      </div>
    </div>
  )
}
export default MarketAnalytics
