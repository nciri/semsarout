import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { FiUserPlus, FiTrash2, FiRefreshCw } from 'react-icons/fi'
import { teamService } from '../../services/teamService'

function SeatGauge({ used, limit }) {
  const { t } = useTranslation(['backoffice'])
  const unlimited = limit === -1
  const label = unlimited
    ? t('backoffice:settings.team.seatGauge.unlimited', { count: used })
    : t('backoffice:settings.team.seatGauge.limited', { used, limit })
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100))
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-[220px]">
      <div className="text-sm text-gray-500 mb-1">{t('backoffice:settings.team.seatGauge.label')}</div>
      <div className="font-semibold text-gray-900">{label}</div>
      {!unlimited && (
        <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function Team() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('team', teamService.getTeam)
  const [email, setEmail] = useState('')
  const [roleId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [newTeam, setNewTeam] = useState('')

  const copyLink = (path) => {
    const url = window.location.origin + path
    navigator.clipboard.writeText(url)
    toast.success(t('backoffice:settings.team.toast.linkCopied'))
  }

  const refresh = () => qc.invalidateQueries('team')
  const onErr = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))

  const invite = useMutation(teamService.invite, {
    onSuccess: (res) => { toast.success(t('backoffice:settings.team.toast.inviteCreated')); if (res.invite_path) copyLink(res.invite_path); setEmail(''); refresh() },
    onError: onErr,
  })
  const resend = useMutation(teamService.resendInvite, {
    onSuccess: (res) => { if (res.invite_path) copyLink(res.invite_path); toast.success(t('backoffice:settings.team.toast.inviteResent')); refresh() }, onError: onErr,
  })
  const revoke = useMutation(teamService.revokeInvite, { onSuccess: () => { toast.success(t('backoffice:settings.team.toast.inviteRevoked')); refresh() }, onError: onErr })
  const createTeam = useMutation(() => teamService.createTeam(newTeam), { onSuccess: () => { toast.success(t('backoffice:settings.team.toast.teamCreated')); setNewTeam(''); refresh() }, onError: onErr })
  const deleteTeam = useMutation(teamService.deleteTeam, { onSuccess: () => { toast.success(t('backoffice:settings.team.toast.teamDeleted')); refresh() }, onError: onErr })
  const removeMember = useMutation(teamService.removeMember, { onSuccess: () => { toast.success(t('backoffice:settings.team.toast.memberRemoved')); refresh() }, onError: onErr })
  const assign = useMutation(({ id, body }) => teamService.updateMember(id, body), { onSuccess: () => refresh(), onError: onErr })

  if (isLoading) return <div className="p-8">{t('backoffice:crm.shared.loading')}</div>
  const d = data || {}
  const canManage = d.can_manage
  const teamsAllowed = (d.teams_quota?.limit ?? 0) !== 0
  const canAddTeam = d.teams_quota?.limit === -1 || (d.teams_quota?.used ?? 0) < (d.teams_quota?.limit ?? 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('backoffice:settings.team.pageTitle')}</h1>
          <p className="text-gray-500">{t('backoffice:settings.team.subtitle')}</p>
        </div>
        <SeatGauge used={d.seats?.used ?? 0} limit={d.seats?.limit ?? 0} />
      </div>

      {canManage && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">{t('backoffice:settings.team.invite.title')}</h3>
          <div className="flex flex-wrap gap-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder={t('backoffice:settings.team.invite.emailPlaceholder')}
                   className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] text-gray-900" />
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
              <option value="">{t('backoffice:settings.team.invite.noTeam')}</option>
              {(d.teams || []).map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
            <button
              onClick={() => email && invite.mutate({ email, role_id: roleId || null, team_id: teamId || null })}
              className="btn-primary inline-flex items-center gap-2">
              <FiUserPlus /> {t('backoffice:settings.team.invite.button')}
            </button>
          </div>
        </div>
      )}

      {(d.invitations || []).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">{t('backoffice:settings.team.pendingInvitations.title')}</h3>
          <ul className="divide-y divide-gray-100">
            {d.invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                <span>{inv.email}{inv.role_name ? ` · ${inv.role_name}` : ''}</span>
                {canManage && (
                  <span className="flex gap-2">
                    <button onClick={() => resend.mutate(inv.id)} className="text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"><FiRefreshCw /> {t('backoffice:settings.team.pendingInvitations.resend')}</button>
                    <button onClick={() => revoke.mutate(inv.id)} className="text-red-600 inline-flex items-center gap-1"><FiTrash2 /> {t('backoffice:settings.team.pendingInvitations.revoke')}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {teamsAllowed && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">{t('backoffice:settings.team.teams.title')}</h3>
            {canManage && (
              <div className="flex gap-2">
                <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder={t('backoffice:settings.team.teams.newPlaceholder')}
                       className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900" />
                <button disabled={!canAddTeam || !newTeam} onClick={() => createTeam.mutate()}
                        className="btn-secondary disabled:opacity-50">{t('backoffice:settings.team.teams.create')}</button>
              </div>
            )}
          </div>
          {!canAddTeam && <p className="text-xs text-amber-600 mb-2">{t('backoffice:settings.team.teams.limitReached')}</p>}
          <div className="flex flex-wrap gap-2">
            {(d.teams || []).map((tm) => (
              <span key={tm.id} className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1 text-sm">
                {tm.name} ({tm.members_count})
                {canManage && <button onClick={() => deleteTeam.mutate(tm.id)} className="text-red-500"><FiTrash2 className="w-3.5 h-3.5" /></button>}
              </span>
            ))}
            {(d.teams || []).length === 0 && <span className="text-gray-400 text-sm">{t('backoffice:settings.team.teams.empty')}</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">{t('backoffice:settings.team.members.title')}</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr><th className="py-2">{t('backoffice:settings.team.members.columns.name')}</th><th>{t('backoffice:settings.team.members.columns.email')}</th><th>{t('backoffice:settings.team.members.columns.team')}</th><th></th></tr>
          </thead>
          <tbody>
            {(d.members || []).map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="py-2">{m.full_name}{m.is_owner && <span className="ms-2 text-xs text-primary-600">{t('backoffice:settings.team.members.owner')}</span>}</td>
                <td>{m.email}</td>
                <td>
                  {canManage && teamsAllowed ? (
                    <select value={m.team_id || ''} onChange={(e) => assign.mutate({ id: m.id, body: { team_id: e.target.value ? Number(e.target.value) : null } })}
                            className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-900">
                      <option value="">{t('backoffice:settings.team.members.noTeam')}</option>
                      {(d.teams || []).map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                    </select>
                  ) : ((d.teams || []).find((tm) => tm.id === m.team_id)?.name || t('backoffice:settings.team.members.noTeam'))}
                </td>
                <td className="text-right">
                  {canManage && !m.is_owner && (
                    <button onClick={() => removeMember.mutate(m.id)} className="text-red-600 text-xs">{t('backoffice:settings.team.members.remove')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Team
