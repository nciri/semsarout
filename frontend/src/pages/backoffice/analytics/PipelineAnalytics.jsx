import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import FunnelBars from '../../../components/analytics/FunnelBars'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtPct } from '../../../components/analytics/palette'

function PipelineAnalytics() {
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'pipeline', filters], () => analyticsService.getPipeline(filters))
  if (isLoading) return <p>Chargement…</p>
  if (isError || !data) return <p className="text-gray-500">Aucune donnée d'analyse disponible.</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Conversion globale" value={fmtPct(s.conversion_overall_pct)} />
        <KpiTile label="Pipeline ouvert" value={fmtMAD(s.pipeline_value_open)} />
        <KpiTile label="Clôtures 30j" value={s.expected_closings_30d.count} sub={fmtMAD(s.expected_closings_30d.value)} />
        <KpiTile label="Clôturés" value={s.funnel.closed} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="Entonnoir" empty={!d.funnel_stages?.length}><FunnelBars stages={d.funnel_stages} /></ChartCard>
        <ChartCard title="Vélocité par étape (j)" empty={!d.stage_velocity_days?.length}>
          <BarsChart data={d.stage_velocity_days} xKey="stage" bars={[{ key: 'days', name: 'Jours' }]} />
        </ChartCard>
      </div>
    </div>
  )
}
export default PipelineAnalytics
