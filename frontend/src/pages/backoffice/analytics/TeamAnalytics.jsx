import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtNum } from '../../../components/analytics/palette'

function TeamAnalytics() {
  const { t } = useTranslation(['backoffice'])
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'team', filters], () => analyticsService.getTeam(filters))
  if (isLoading) return <p>{t('backoffice:analytics.shared.loading')}</p>
  if (isError || !data) return <p className="text-gray-500">{t('backoffice:analytics.shared.noData')}</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label={t('backoffice:analytics.team.kpis.costPerLead')} value={fmtMAD(s.cost_per_lead)} />
        <KpiTile label={t('backoffice:analytics.team.kpis.bestSource')} value={s.best_source || '—'} />
        <KpiTile label={t('backoffice:analytics.team.kpis.agents')} value={fmtNum(d.agent_performance?.length || 0)} />
        <KpiTile label={t('backoffice:analytics.team.kpis.sources')} value={fmtNum(s.lead_sources?.length || 0)} />
      </div>
      <ChartCard title={t('backoffice:analytics.team.charts.commissionByAgent')} empty={!d.agent_performance?.length}>
        <BarsChart data={d.agent_performance} xKey="agent" bars={[{ key: 'commission', name: t('backoffice:analytics.team.series.commission') }]} />
      </ChartCard>
      <ChartCard title={t('backoffice:analytics.team.charts.conversionBySource')} empty={!d.conversion_by_source?.length}>
        <BarsChart data={d.conversion_by_source} xKey="source" bars={[{ key: 'pct', name: t('backoffice:analytics.team.series.conversionPct') }]} />
      </ChartCard>
      <ChartCard title={t('backoffice:analytics.team.charts.roiBySource')} empty={!d.lead_roi_by_source?.length}>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left text-gray-500"><tr><th className="py-2">{t('backoffice:analytics.team.table.source')}</th><th>{t('backoffice:analytics.team.table.leads')}</th><th>{t('backoffice:analytics.team.table.converted')}</th><th>{t('backoffice:analytics.team.table.cost')}</th><th>{t('backoffice:analytics.team.table.conversion')}</th></tr></thead>
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
