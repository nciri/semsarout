import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiUsers } from 'react-icons/fi'
import { stayService } from '../../../services/stayService'
import { EmptyState, Select } from '../../../components/backoffice/ui'
import { Chip, Kv, TD, TH } from '../components/kit'

/**
 * Qui tient quel bien, et ce que chaque équipe a abattu le mois dernier.
 *
 * Les équipes sont celles de l'agence (écran Équipe) : on ne les recrée pas ici, on leur
 * confie des biens. La tâche de ménage née d'un départ hérite alors de l'équipe du bien,
 * au lieu d'attendre qu'on désigne quelqu'un à la main.
 */
function OpsTeamsPanel() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('stays-ops-teams', () => stayService.listOpsTeams())

  const assign = useMutation(({ propertyId, teamId }) => stayService.assignTeam(propertyId, teamId), {
    onSuccess: () => {
      toast.success(t('backoffice:stays.teams.assigned'))
      qc.invalidateQueries('stays-ops-teams')
      qc.invalidateQueries('stays-cleanings')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (error) return <p className="px-2.5 py-6 text-sm text-gray-500">{t('backoffice:stays.shared.loadError')}</p>
  if (isLoading) return <div className="h-32 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />

  const teams = data?.teams || []
  const properties = data?.properties || []

  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-[14px] font-bold">{t('backoffice:stays.teams.performanceTitle')}</h3>
          <p className="text-[12.5px] text-gray-500">
            {t('backoffice:stays.teams.performanceSub', { count: data?.performance_days || 30 })}
          </p>
        </div>
        {!teams.length ? (
          <EmptyState icon={FiUsers} title={t('backoffice:stays.teams.empty.title')}
            description={t('backoffice:stays.teams.empty.description')}
            action={(
              <Link to="/backoffice/equipe" className="font-medium text-primary-700 hover:underline">
                {t('backoffice:stays.teams.empty.link')}
              </Link>
            )} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <section key={team.id} className="grid content-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 truncate font-display text-[14px] font-bold">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: team.color || '#9CA3AF' }} />
                    {team.name}
                  </h4>
                  <Chip tone="neutral">
                    {t(`backoffice:settings.team.kinds.${team.kind}`, { defaultValue: team.kind })}
                  </Chip>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Kv label={t('backoffice:stays.teams.done')} value={team.performance.done} />
                  <Kv label={t('backoffice:stays.teams.planned')} value={team.performance.planned} />
                  <Kv label={t('backoffice:stays.teams.late')} value={team.performance.late}
                    to={`/backoffice/sejours/menage?statut=pending&equipe=${team.id}`} />
                  <Kv label={t('backoffice:stays.teams.avgMinutes')}
                    value={team.performance.avg_minutes == null ? '—' : team.performance.avg_minutes}
                    unit={team.performance.avg_minutes == null ? null : t('backoffice:stays.teams.minutes')} />
                </div>
                {team.performance.urgent_reports > 0 && (
                  <Chip tone="crit">
                    {t('backoffice:stays.teams.urgentReports', { count: team.performance.urgent_reports })}
                  </Chip>
                )}
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-display text-[14px] font-bold">{t('backoffice:stays.teams.assignTitle')}</h3>
        <p className="text-[12.5px] text-gray-500">{t('backoffice:stays.teams.assignHelp')}</p>
        {!properties.length ? (
          <p className="text-[13px] text-gray-500">{t('backoffice:stays.teams.noProperty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>{t('backoffice:stays.planning.columns.property')}</th>
                  <th className={TH}>{t('backoffice:stays.teams.team')}</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.property_id}>
                    <td className={TD}>{p.property_title}</td>
                    <td className={TD}>
                      <Select aria-label={t('backoffice:stays.teams.teamFor', { property: p.property_title })}
                        value={p.team_id || ''} className="w-auto"
                        onChange={(e) => assign.mutate({
                          propertyId: p.property_id,
                          teamId: e.target.value ? Number(e.target.value) : null,
                        })}>
                        <option value="">{t('backoffice:stays.teams.noTeam')}</option>
                        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
export default OpsTeamsPanel
