import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import FunnelBars from '../../../components/analytics/FunnelBars'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtPct } from '../../../components/analytics/palette'

function PipelineAnalytics() {
  const { t } = useTranslation(['backoffice'])
  const filters = useFilters()
  const { data, isLoading, isError } = useQuery(['analytics', 'pipeline', filters], () => analyticsService.getPipeline(filters))
  if (isLoading) return <p>{t('backoffice:analytics.shared.loading')}</p>
  if (isError || !data) return <p className="text-gray-500">{t('backoffice:analytics.shared.noData')}</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label={t('backoffice:analytics.pipeline.kpis.globalConversion')} value={fmtPct(s.conversion_overall_pct)} />
        <KpiTile label={t('backoffice:analytics.pipeline.kpis.openPipeline')} value={fmtMAD(s.pipeline_value_open)} />
        <KpiTile label={t('backoffice:analytics.pipeline.kpis.closings30d')} value={s.expected_closings_30d.count} sub={fmtMAD(s.expected_closings_30d.value)} />
        <KpiTile label={t('backoffice:analytics.pipeline.kpis.closed')} value={s.funnel.closed} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title={t('backoffice:analytics.pipeline.charts.funnel')} empty={!d.funnel_stages?.length}><FunnelBars stages={d.funnel_stages} /></ChartCard>
        <ChartCard title={t('backoffice:analytics.pipeline.charts.velocityByStage')} empty={!d.stage_velocity_days?.length}>
          <BarsChart data={d.stage_velocity_days} xKey="stage" bars={[{ key: 'days', name: t('backoffice:analytics.pipeline.series.days') }]} />
        </ChartCard>
      </div>
    </div>
  )
}
export default PipelineAnalytics
