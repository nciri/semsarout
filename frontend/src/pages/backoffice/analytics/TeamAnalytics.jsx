import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtNum } from '../../../components/analytics/palette'

function TeamAnalytics() {
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'team', filters], () => analyticsService.getTeam(filters))
  if (isLoading) return <p>Chargement…</p>
  if (isError || !data) return <p className="text-gray-500">Aucune donnée d'analyse disponible.</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Coût par lead" value={fmtMAD(s.cost_per_lead)} />
        <KpiTile label="Meilleure source" value={s.best_source || '—'} />
        <KpiTile label="Agents" value={fmtNum(d.agent_performance?.length || 0)} />
        <KpiTile label="Sources" value={fmtNum(s.lead_sources?.length || 0)} />
      </div>
      <ChartCard title="Commission par agent" empty={!d.agent_performance?.length}>
        <BarsChart data={d.agent_performance} xKey="agent" bars={[{ key: 'commission', name: 'Commission' }]} />
      </ChartCard>
      <ChartCard title="Conversion par source" empty={!d.conversion_by_source?.length}>
        <BarsChart data={d.conversion_by_source} xKey="source" bars={[{ key: 'pct', name: 'Conversion %' }]} />
      </ChartCard>
      <ChartCard title="ROI par source" empty={!d.lead_roi_by_source?.length}>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left text-gray-500"><tr><th className="py-2">Source</th><th>Leads</th><th>Convertis</th><th>Coût</th><th>Conv.</th></tr></thead>
          <tbody>{d.lead_roi_by_source.map((r) => (
            <tr key={r.source} className="border-t border-gray-100">
              <td className="py-2">{r.source}</td><td>{r.leads}</td><td>{r.converted}</td><td>{fmtMAD(r.cost)}</td><td>{r.conversion_pct} %</td>
            </tr>))}</tbody>
        </table></div>
      </ChartCard>
    </div>
  )
}
export default TeamAnalytics
