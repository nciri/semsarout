import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import BarsChart from '../../../components/analytics/BarsChart'
import DonutChart from '../../../components/analytics/DonutChart'
import { fmtMAD, fmtNum, fmtPct } from '../../../components/analytics/palette'

function MarketAnalytics() {
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'market', filters], () => analyticsService.getMarket(filters))
  if (isLoading) return <p>Chargement…</p>
  if (isError || !data) return <p className="text-gray-500">Aucune donnée d'analyse disponible.</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Prix/m² portefeuille" value={fmtMAD(s.portfolio_avg_price_sqm)} />
        <KpiTile label="Prix/m² marché" value={fmtMAD(s.market_avg_price_sqm)} />
        <KpiTile label="Écart vs marché" value={fmtPct(s.price_gap_pct)} tone={s.price_gap_pct > 0 ? 'up' : 'down'} />
        <KpiTile label="Jours sur le marché" value={fmtNum(s.avg_days_on_market)} />
      </div>
      <ChartCard title="Prix/m² par quartier (portefeuille vs marché)" empty={!d.price_sqm_by_neighborhood?.length}>
        <BarsChart data={d.price_sqm_by_neighborhood} xKey="area"
                   bars={[{ key: 'portfolio', name: 'Portefeuille' }, { key: 'market', name: 'Marché' }]} />
      </ChartCard>
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="Jours sur le marché" empty={!d.days_on_market_distribution?.length}>
          <BarsChart data={d.days_on_market_distribution} xKey="bucket" bars={[{ key: 'count', name: 'Annonces' }]} />
        </ChartCard>
        <ChartCard title="Valorisation par ville" empty={!d.portfolio_valuation_by_city?.length}>
          <DonutChart data={d.portfolio_valuation_by_city} nameKey="city" valueKey="value" />
        </ChartCard>
      </div>
    </div>
  )
}
export default MarketAnalytics
