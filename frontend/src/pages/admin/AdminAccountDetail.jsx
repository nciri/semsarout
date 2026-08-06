import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft } from 'react-icons/fi'
import { adminService } from '../../services/adminService'
import useAuthStore from '../../store/authStore'
import DirIcon from '../../components/common/DirIcon'
import { useFormat } from '../../utils/format'

function AdminAccountDetail() {
  const { t } = useTranslation(['admin', 'common'])
  const { fmtDate, fmtDateTime } = useFormat()
  const { kind, id } = useParams()   // kind: 'user' | 'agence'
  const isUser = kind === 'user'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { startImpersonation } = useAuthStore()

  const { data, isLoading } = useQuery(
    ['admin', 'account', kind, id],
    () => (isUser ? adminService.getUser(id) : adminService.getAgency(id))
  )

  const refresh = () => qc.invalidateQueries(['admin', 'account', kind, id])

  // Mutations are declared directly (not via a non-"use"-prefixed wrapper) so
  // react-hooks/rules-of-hooks can verify they run unconditionally, in a fixed order.
  const suspend = useMutation(
    () => (isUser ? adminService.suspendUser(id, 'Suspendu par admin') : adminService.suspendAgency(id, 'Suspendu par admin')),
    {
      onSuccess: () => { toast.success(t('admin:accountDetail.toasts.suspended')); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || t('admin:accountDetail.toasts.error')),
    }
  )
  const unsuspend = useMutation(
    () => (isUser ? adminService.unsuspendUser(id) : adminService.unsuspendAgency(id)),
    {
      onSuccess: () => { toast.success(t('admin:accountDetail.toasts.reactivated')); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || t('admin:accountDetail.toasts.error')),
    }
  )
  const del = useMutation(
    () => (isUser ? adminService.deleteUser(id) : adminService.deleteAgency(id)),
    {
      onSuccess: () => { toast.success(t('admin:accountDetail.toasts.deleted')); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || t('admin:accountDetail.toasts.error')),
    }
  )
  const restore = useMutation(
    () => (isUser ? adminService.restoreUser(id) : adminService.restoreAgency(id)),
    {
      onSuccess: () => { toast.success(t('admin:accountDetail.toasts.restored')); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || t('admin:accountDetail.toasts.error')),
    }
  )
  const anonymize = useMutation(
    () => (isUser ? adminService.anonymizeUser(id) : adminService.anonymizeAgency(id)),
    {
      onSuccess: () => { toast.success(t('admin:accountDetail.toasts.anonymized')); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || t('admin:accountDetail.toasts.error')),
    }
  )

  if (isLoading) return <p>{t('admin:shared.loading')}</p>
  const entity = isUser ? data.user : data.agency
  const status = entity.deleted_at ? 'deleted' : (entity.is_suspended ? 'suspended' : 'active')

  const doImpersonate = async () => {
    const res = await adminService.impersonate(id)
    startImpersonation(res.user, res.access_token)
    navigate('/dashboard')
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-slate-500 mb-4">
        <DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('admin:accountDetail.back')}
      </button>
      <h1 className="text-2xl font-bold text-midnight">
        {isUser ? entity.full_name : entity.name}
      </h1>
      <p className="text-slate-500">
        {entity.email} · {t('admin:accountDetail.statusPrefix')} {t(`admin:accounts.status.${status}`, { defaultValue: status })}
      </p>
      {entity.deleted_at && (
        <p className="text-red-600 text-sm mt-2">
          {t('admin:accountDetail.deletedNotice', { date: fmtDate(entity.deleted_at) })}
        </p>
      )}

      {isUser && (
        <button onClick={doImpersonate}
                className="mt-4 px-4 py-2 rounded-lg bg-midnight text-ivory text-sm">
          {t('admin:accountDetail.impersonateButton')}
        </button>
      )}

      <section className="mt-8 border border-red-200 rounded-xl p-5">
        <h2 className="font-semibold text-red-700 mb-3">{t('admin:accountDetail.dangerZone.title')}</h2>
        <div className="flex flex-wrap gap-3">
          {status !== 'suspended' && status !== 'deleted' && (
            <button onClick={() => suspend.mutate()} className="px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm">{t('admin:accountDetail.dangerZone.suspend')}</button>
          )}
          {status === 'suspended' && (
            <button onClick={() => unsuspend.mutate()} className="px-3 py-2 rounded-lg bg-green-100 text-green-800 text-sm">{t('admin:accountDetail.dangerZone.unsuspend')}</button>
          )}
          {status !== 'deleted' && (
            <button onClick={() => del.mutate()} className="px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm">{t('admin:accountDetail.dangerZone.delete')}</button>
          )}
          {status === 'deleted' && !entity.anonymized_at && (
            <button onClick={() => restore.mutate()} className="px-3 py-2 rounded-lg bg-green-100 text-green-800 text-sm">{t('admin:accountDetail.dangerZone.restore')}</button>
          )}
          {!entity.anonymized_at && (
            <button onClick={() => anonymize.mutate()} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm">{t('admin:accountDetail.dangerZone.anonymize')}</button>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-midnight mb-3">{t('admin:accountDetail.activity.title')}</h2>
        <ul className="space-y-2">
          {(data.activity || []).map((a) => (
            <li key={a.id} className="text-sm text-slate-600 border-b border-slate-100 pb-2">
              <span className="font-medium">{a.action}</span> — {a.created_at
                ? fmtDateTime(a.created_at, { second: '2-digit' }) : ''}
            </li>
          ))}
          {(data.activity || []).length === 0 && <li className="text-slate-400 text-sm">{t('admin:accountDetail.activity.empty')}</li>}
        </ul>
      </section>
    </div>
  )
}

export default AdminAccountDetail
