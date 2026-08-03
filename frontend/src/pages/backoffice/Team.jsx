import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiUserPlus, FiCopy, FiTrash2, FiRefreshCw } from 'react-icons/fi'
import { teamService } from '../../services/teamService'

function SeatGauge({ used, limit }) {
  const unlimited = limit === -1
  const label = unlimited ? `${used} membre(s) · illimité` : `${used} / ${limit} sièges`
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100))
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-[220px]">
      <div className="text-sm text-gray-500 mb-1">Sièges</div>
      <div className="font-semibold text-gray-900">{label}</div>
      {!unlimited && (
        <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function copyLink(path) {
  const url = window.location.origin + path
  navigator.clipboard.writeText(url)
  toast.success('Lien d\'invitation copié')
}

function Team() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('team', teamService.getTeam)
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [newTeam, setNewTeam] = useState('')

  const refresh = () => qc.invalidateQueries('team')
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')

  const invite = useMutation(teamService.invite, {
    onSuccess: (res) => { toast.success('Invitation créée'); if (res.invite_path) copyLink(res.invite_path); setEmail(''); refresh() },
    onError: onErr,
  })
  const resend = useMutation(teamService.resendInvite, {
    onSuccess: (res) => { if (res.invite_path) copyLink(res.invite_path); toast.success('Invitation relancée'); refresh() }, onError: onErr,
  })
  const revoke = useMutation(teamService.revokeInvite, { onSuccess: () => { toast.success('Invitation révoquée'); refresh() }, onError: onErr })
  const createTeam = useMutation(() => teamService.createTeam(newTeam), { onSuccess: () => { toast.success('Équipe créée'); setNewTeam(''); refresh() }, onError: onErr })
  const deleteTeam = useMutation(teamService.deleteTeam, { onSuccess: () => { toast.success('Équipe supprimée'); refresh() }, onError: onErr })
  const removeMember = useMutation(teamService.removeMember, { onSuccess: () => { toast.success('Membre retiré'); refresh() }, onError: onErr })
  const assign = useMutation(({ id, body }) => teamService.updateMember(id, body), { onSuccess: () => refresh(), onError: onErr })

  if (isLoading) return <div className="p-8">Chargement…</div>
  const d = data || {}
  const canManage = d.can_manage
  const teamsAllowed = (d.teams_quota?.limit ?? 0) !== 0
  const canAddTeam = d.teams_quota?.limit === -1 || (d.teams_quota?.used ?? 0) < (d.teams_quota?.limit ?? 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Équipe</h1>
          <p className="text-gray-500">Gérez les membres, invitations et équipes.</p>
        </div>
        <SeatGauge used={d.seats?.used ?? 0} limit={d.seats?.limit ?? 0} />
      </div>

      {canManage && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Inviter un membre</h3>
          <div className="flex flex-wrap gap-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="email@exemple.com"
                   className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] text-gray-900" />
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
              <option value="">Sans équipe</option>
              {(d.teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              onClick={() => email && invite.mutate({ email, role_id: roleId || null, team_id: teamId || null })}
              className="btn-primary inline-flex items-center gap-2">
              <FiUserPlus /> Inviter
            </button>
          </div>
        </div>
      )}

      {(d.invitations || []).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Invitations en attente</h3>
          <ul className="divide-y divide-gray-100">
            {d.invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                <span>{inv.email}{inv.role_name ? ` · ${inv.role_name}` : ''}</span>
                {canManage && (
                  <span className="flex gap-2">
                    <button onClick={() => resend.mutate(inv.id)} className="text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"><FiRefreshCw /> Relancer</button>
                    <button onClick={() => revoke.mutate(inv.id)} className="text-red-600 inline-flex items-center gap-1"><FiTrash2 /> Révoquer</button>
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
            <h3 className="font-semibold text-gray-900">Équipes</h3>
            {canManage && (
              <div className="flex gap-2">
                <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Nouvelle équipe"
                       className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900" />
                <button disabled={!canAddTeam || !newTeam} onClick={() => createTeam.mutate()}
                        className="btn-secondary disabled:opacity-50">Créer</button>
              </div>
            )}
          </div>
          {!canAddTeam && <p className="text-xs text-amber-600 mb-2">Limite d'équipes atteinte — passez à un plan supérieur.</p>}
          <div className="flex flex-wrap gap-2">
            {(d.teams || []).map((t) => (
              <span key={t.id} className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1 text-sm">
                {t.name} ({t.members_count})
                {canManage && <button onClick={() => deleteTeam.mutate(t.id)} className="text-red-500"><FiTrash2 className="w-3.5 h-3.5" /></button>}
              </span>
            ))}
            {(d.teams || []).length === 0 && <span className="text-gray-400 text-sm">Aucune équipe.</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Membres</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr><th className="py-2">Nom</th><th>Email</th><th>Équipe</th><th></th></tr>
          </thead>
          <tbody>
            {(d.members || []).map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="py-2">{m.full_name}{m.is_owner && <span className="ml-2 text-xs text-primary-600">(propriétaire)</span>}</td>
                <td>{m.email}</td>
                <td>
                  {canManage && teamsAllowed ? (
                    <select value={m.team_id || ''} onChange={(e) => assign.mutate({ id: m.id, body: { team_id: e.target.value ? Number(e.target.value) : null } })}
                            className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-900">
                      <option value="">—</option>
                      {(d.teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : ((d.teams || []).find((t) => t.id === m.team_id)?.name || '—')}
                </td>
                <td className="text-right">
                  {canManage && !m.is_owner && (
                    <button onClick={() => removeMember.mutate(m.id)} className="text-red-600 text-xs">Retirer</button>
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
