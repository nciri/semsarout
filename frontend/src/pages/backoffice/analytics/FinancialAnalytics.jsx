import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import TrendLine from '../../../components/analytics/TrendLine'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtNum } from '../../../components/analytics/palette'

function FinancialAnalytics() {
  const { t } = useTranslation(['backoffice'])
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'financial', filters], () => analyticsService.getFinancial(filters))
  if (isLoading) return <p>{t('backoffice:analytics.shared.loading')}</p>
  if (isError || !data) return <p className="text-gray-500">{t('backoffice:analytics.shared.noData')}</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label={t('backoffice:analytics.financial.kpis.revenueRealized')} value={fmtMAD(s.revenue_realized)} />
        <KpiTile label={t('backoffice:analytics.financial.kpis.weightedPipeline')} value={fmtMAD(s.revenue_pipeline_weighted)} />
        <KpiTile label={t('backoffice:analytics.financial.kpis.dealsWon')} value={fmtNum(s.deals_won)} />
        <KpiTile label={t('backoffice:analytics.financial.kpis.avgCycle')} value={fmtNum(s.avg_sales_cycle_days)} />
      </div>
      <ChartCard title={t('backoffice:analytics.financial.charts.revenueTrend')} empty={!d.revenue_trend?.length}>
        <TrendLine data={d.revenue_trend} xKey="month" lines={[{ key: 'realized', name: t('backoffice:analytics.financial.series.realized') }]} />
      </ChartCard>
      <ChartCard title={t('backoffice:analytics.financial.charts.commissionByAgent')} empty={!d.commission_by_agent?.length}>
        <BarsChart data={d.commission_by_agent} xKey="agent" bars={[{ key: 'commission', name: t('backoffice:analytics.financial.series.commission') }]} />
      </ChartCard>
    </div>
  )
}
export default FinancialAnalytics
