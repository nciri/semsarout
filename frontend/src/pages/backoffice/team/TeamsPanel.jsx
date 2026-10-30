import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { FiEdit2, FiPlus, FiTrash2, FiUserPlus } from 'react-icons/fi'
import { teamService } from '../../../services/teamService'
import { Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import { Chip, IconAction } from '../components/kit'

const EMPTY = { name: '', kind: 'generale', color: '', description: '' }

/**
 * Équipes de l'agence : leur métier, leur couleur, et qui y travaille.
 *
 * Deux façons d'appartenir : le rattachement principal (une seule équipe, géré dans le
 * tableau des membres) et le renfort, avec le rôle tenu dans l'équipe d'accueil. Sans le
 * second, prêter un agent à la maintenance le samedi obligerait à le sortir du ménage.
 */
function TeamsPanel({ teams, kinds, members, canManage, canAddTeam, onChanged }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const [form, setForm] = useState(null)        // création ou édition d'une équipe
  const [joining, setJoining] = useState(null)  // ajout d'un renfort
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const refresh = () => { qc.invalidateQueries('team'); onChanged?.() }
  const onErr = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))
  const jobsOf = (kind) => kinds.find((k) => k.kind === kind)?.jobs || []

  const save = useMutation(() => (form.id
    ? teamService.updateTeam(form.id, form)
    : teamService.createTeam(form)), {
    onSuccess: () => {
      toast.success(t(form.id
        ? 'backoffice:settings.team.teams.updated'
        : 'backoffice:settings.team.toast.teamCreated'))
      setForm(null)
      refresh()
    },
    onError: onErr,
  })
  const remove = useMutation(teamService.deleteTeam, {
    onSuccess: () => { toast.success(t('backoffice:settings.team.toast.teamDeleted')); refresh() },
    onError: onErr,
  })
  const join = useMutation(() => teamService.addMembership(joining.team.id, {
    user_id: Number(joining.user_id), job: joining.job,
  }), {
    onSuccess: () => { toast.success(t('backoffice:settings.team.teams.memberAdded')); setJoining(null); refresh() },
    onError: onErr,
  })
  const leave = useMutation(({ teamId, userId }) => teamService.removeMembership(teamId, userId), {
    onSuccess: () => { toast.success(t('backoffice:settings.team.teams.memberRemoved')); refresh() },
    onError: onErr,
  })

  const nameOf = (userId) => members.find((m) => m.id === userId)?.full_name || `#${userId}`

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">{t('backoffice:settings.team.teams.title')}</h3>
        {canManage && (
          <IconAction icon={FiPlus} label={t('backoffice:settings.team.teams.create')} tone="primary"
            tipAlign="end" disabled={!canAddTeam} onClick={() => setForm({ ...EMPTY })} />
        )}
      </div>
      {!canAddTeam && <p className="mb-2 text-xs text-amber-600">{t('backoffice:settings.team.teams.limitReached')}</p>}

      {!teams.length ? (
        <p className="text-sm text-gray-400">{t('backoffice:settings.team.teams.empty')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((tm) => (
            <section key={tm.id} className="grid content-start gap-2 rounded-xl border border-gray-200 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-2 truncate font-display text-[14px] font-bold">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: tm.color || '#9CA3AF' }} />
                    {tm.name}
                  </h4>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t(`backoffice:settings.team.kinds.${tm.kind}`, { defaultValue: tm.kind })}
                    {' · '}{t('backoffice:settings.team.teams.membersCount', { count: tm.members_count })}
                  </p>
                </div>
                {canManage && (
                  <span className="flex shrink-0 gap-0.5">
                    <IconAction icon={FiUserPlus} label={t('backoffice:settings.team.teams.addMember')}
                      onClick={() => setJoining({ team: tm, user_id: '', job: jobsOf(tm.kind).at(-1) || 'membre' })} />
                    <IconAction icon={FiEdit2} label={t('backoffice:settings.team.teams.edit')}
                      onClick={() => setForm({
                        id: tm.id, name: tm.name, kind: tm.kind,
                        color: tm.color || '', description: tm.description || '',
                      })} />
                    <IconAction icon={FiTrash2} label={t('backoffice:settings.team.teams.delete')} tone="danger"
                      tipAlign="end" onClick={() => remove.mutate(tm.id)} />
                  </span>
                )}
              </div>
              {tm.description && <p className="text-[12.5px] text-gray-600">{tm.description}</p>}
              {(tm.memberships || []).length > 0 && (
                <ul className="grid gap-1 text-[12.5px]">
                  {tm.memberships.map((m) => (
                    <li key={m.user_id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{nameOf(m.user_id)}</span>
                      <span className="flex items-center gap-1.5">
                        <Chip tone="neutral">
                          {t(`backoffice:settings.team.jobs.${m.job}`, { defaultValue: m.job })}
                        </Chip>
                        {canManage && (
                          <button type="button" className="text-xs text-red-600 hover:underline"
                            onClick={() => leave.mutate({ teamId: tm.id, userId: m.user_id })}>
                            {t('backoffice:settings.team.teams.removeMember')}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)}
        title={t(form?.id ? 'backoffice:settings.team.teams.editTitle' : 'backoffice:settings.team.teams.newTitle')}
        footer={<>
          <button onClick={() => setForm(null)} className={SECONDARY_BTN}>{t('backoffice:settings.team.teams.cancel')}</button>
          <button disabled={!form?.name || save.isLoading} onClick={() => save.mutate()} className={PRIMARY_BTN}>
            {t('backoffice:settings.team.teams.submit')}
          </button>
        </>}>
        <Field label={t('backoffice:settings.team.teams.nameLabel')} value={form?.name || ''} onChange={set('name')} />
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="team-kind">
            {t('backoffice:settings.team.teams.kindLabel')}
          </label>
          <Select id="team-kind" value={form?.kind || 'generale'} onChange={set('kind')} className="w-full">
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {t(`backoffice:settings.team.kinds.${k.kind}`, { defaultValue: k.kind })}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-gray-500">
            {t('backoffice:settings.team.teams.kindHelp', {
              jobs: jobsOf(form?.kind)
                .map((j) => t(`backoffice:settings.team.jobs.${j}`, { defaultValue: j })).join(', '),
            })}
          </p>
        </div>
        <Field type="color" label={t('backoffice:settings.team.teams.colorLabel')}
          value={form?.color || '#1E7F4E'} onChange={set('color')} />
        <Field label={t('backoffice:settings.team.teams.descriptionLabel')}
          value={form?.description || ''} onChange={set('description')} />
      </Modal>

      <Modal open={joining !== null} onClose={() => setJoining(null)}
        title={t('backoffice:settings.team.teams.addMemberTitle', { team: joining?.team?.name || '' })}
        footer={<>
          <button onClick={() => setJoining(null)} className={SECONDARY_BTN}>{t('backoffice:settings.team.teams.cancel')}</button>
          <button disabled={!joining?.user_id || join.isLoading} onClick={() => join.mutate()} className={PRIMARY_BTN}>
            {t('backoffice:settings.team.teams.submit')}
          </button>
        </>}>
        <p className="mb-3 text-[13px] text-gray-500">{t('backoffice:settings.team.teams.addMemberHelp')}</p>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="team-member">
            {t('backoffice:settings.team.teams.memberLabel')}
          </label>
          <Select id="team-member" value={joining?.user_id || ''} className="w-full"
            onChange={(e) => setJoining((j) => ({ ...j, user_id: e.target.value }))}>
            <option value="">{t('backoffice:settings.team.teams.memberPlaceholder')}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="team-job">
            {t('backoffice:settings.team.teams.jobLabel')}
          </label>
          <Select id="team-job" value={joining?.job || ''} className="w-full"
            onChange={(e) => setJoining((j) => ({ ...j, job: e.target.value }))}>
            {jobsOf(joining?.team?.kind).map((j) => (
              <option key={j} value={j}>{t(`backoffice:settings.team.jobs.${j}`, { defaultValue: j })}</option>
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  )
}
export default TeamsPanel
