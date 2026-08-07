import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheckCircle, FiCircle, FiTrash2, FiPlus, FiArrowLeft, FiXCircle } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

function LegalCaseDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['legal-case', id], () => legalService.getCase(id))
  const { data: notariesData } = useQuery('notaries', () => legalService.listNotaries())
  const [newTask, setNewTask] = useState('')

  const refresh = () => qc.invalidateQueries(['legal-case', id])
  const onErr = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))
  const toggle = useMutation(({ tid, status }) => legalService.updateTask(tid, { status }), { onSuccess: refresh, onError: onErr })
  const addTask = useMutation(() => legalService.addTask(id, { label: newTask }), { onSuccess: () => { setNewTask(''); refresh() }, onError: onErr })
  const delTask = useMutation((tid) => legalService.deleteTask(tid), { onSuccess: refresh, onError: onErr })
  const setStatus = useMutation((status) => legalService.updateCase(id, { status }), { onSuccess: refresh, onError: onErr })
  const setNotary = useMutation((notary_id) => legalService.updateCase(id, { notary_id: notary_id || null }), { onSuccess: refresh, onError: onErr })

  if (isLoading) return <div className="max-w-3xl animate-pulse space-y-4"><div className="h-4 w-24 bg-gray-200 rounded" /><div className="h-32 bg-gray-100 rounded-xl" /><div className="h-40 bg-gray-100 rounded-xl" /></div>
  if (isError || !data?.case) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
        {t('backoffice:legal.caseDetail.notFound.text')} <Link to="/backoffice/notaires/dossiers" className="text-primary-600 hover:underline">{t('backoffice:legal.caseDetail.notFound.link')}</Link>
      </div>
    )
  }
  const c = data.case
  const pct = c.tasks_total ? Math.round((c.tasks_done / c.tasks_total) * 100) : 0
  const notaries = notariesData?.notaries || []

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/backoffice/notaires/dossiers" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> {t('backoffice:legal.caseDetail.back')}
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
          {pct === 0 && c.status !== 'closed' && (
            <button
              onClick={() => setStatus.mutate('closed')}
              disabled={setStatus.isLoading}
              title={t('backoffice:legal.caseDetail.closeCaseTooltip')}
              className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
            >
              <FiXCircle className="w-4 h-4" /> {t('backoffice:legal.caseDetail.closeCase')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {t(`backoffice:legal.shared.caseType.${c.case_type}`, { defaultValue: c.case_type })}
          </span>
          <label className="text-sm text-gray-500">{t('backoffice:legal.caseDetail.statusLabel')}
            <select value={c.status} onChange={(e) => setStatus.mutate(e.target.value)} className="ml-2 px-2 py-1 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="open">{t('backoffice:legal.shared.status.open')}</option><option value="in_progress">{t('backoffice:legal.shared.status.in_progress')}</option><option value="closed">{t('backoffice:legal.shared.status.closed')}</option>
            </select>
          </label>
          <label className="text-sm text-gray-500">{t('backoffice:legal.caseDetail.notaryLabel')}
            <select value={c.notary_id || ''} onChange={(e) => setNotary.mutate(e.target.value ? Number(e.target.value) : '')} className="ml-2 px-2 py-1 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">{t('backoffice:legal.caseDetail.notaryNone')}</option>
              {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-sm text-gray-500 mb-1"><span>{t('backoffice:legal.caseDetail.progress')}</span><span className="tabular-nums">{c.tasks_done}/{c.tasks_total} · {pct}%</span></div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">{t('backoffice:legal.caseDetail.tasksTitle')}</h2>
        <ul className="space-y-2">
          {(c.tasks || []).map((task) => (
            <li key={task.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors">
              <button onClick={() => toggle.mutate({ tid: task.id, status: NEXT[task.status] })} className="flex-shrink-0" title={t('backoffice:legal.caseDetail.taskToggleTooltip')}>
                {task.status === 'done'
                  ? <FiCheckCircle className="w-5 h-5 text-emerald-600" />
                  : <FiCircle className={`w-5 h-5 ${task.status === 'in_progress' ? 'text-amber-500' : 'text-gray-300'}`} />}
              </button>
              <span className={`flex-1 text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.label}</span>
              <button onClick={() => delTask.mutate(task.id)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title={t('backoffice:legal.caseDetail.taskDeleteTooltip')}>
                <FiTrash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {(c.tasks || []).length === 0 && <li className="text-sm text-gray-400 py-2">{t('backoffice:legal.caseDetail.tasksEmpty')}</li>}
        </ul>
        <div className="flex gap-2 mt-4">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newTask) addTask.mutate() }}
            placeholder={t('backoffice:legal.caseDetail.addTaskPlaceholder')}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button disabled={!newTask || addTask.isLoading} onClick={() => addTask.mutate()} className="inline-flex items-center gap-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <FiPlus className="w-4 h-4" /> {t('backoffice:legal.caseDetail.addButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
export default LegalCaseDetail
