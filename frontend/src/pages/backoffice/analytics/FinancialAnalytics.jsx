import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import TrendLine from '../../../components/analytics/TrendLine'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtNum } from '../../../components/analytics/palette'

function FinancialAnalytics() {
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'financial', filters], () => analyticsService.getFinancial(filters))
  if (isLoading) return <p>Chargement…</p>
  if (isError || !data) return <p className="text-gray-500">Aucune donnée d'analyse disponible.</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="CA réalisé" value={fmtMAD(s.revenue_realized)} />
        <KpiTile label="Pipeline pondéré" value={fmtMAD(s.revenue_pipeline_weighted)} />
        <KpiTile label="Deals gagnés" value={fmtNum(s.deals_won)} />
        <KpiTile label="Cycle moyen (j)" value={fmtNum(s.avg_sales_cycle_days)} />
      </div>
      <ChartCard title="Tendance du CA réalisé" empty={!d.revenue_trend?.length}>
        <TrendLine data={d.revenue_trend} xKey="month" lines={[{ key: 'realized', name: 'CA réalisé' }]} />
      </ChartCard>
      <ChartCard title="Commission par agent" empty={!d.commission_by_agent?.length}>
        <BarsChart data={d.commission_by_agent} xKey="agent" bars={[{ key: 'commission', name: 'Commission' }]} />
      </ChartCard>
    </div>
  )
}
export default FinancialAnalytics
