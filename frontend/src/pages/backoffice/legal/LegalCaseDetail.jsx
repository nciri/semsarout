import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiCheckCircle, FiCircle, FiTrash2, FiPlus } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

function LegalCaseDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery(['legal-case', id], () => legalService.getCase(id))
  const { data: notariesData } = useQuery('notaries', () => legalService.listNotaries())
  const [newTask, setNewTask] = useState('')

  const refresh = () => qc.invalidateQueries(['legal-case', id])
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const toggle = useMutation(({ tid, status }) => legalService.updateTask(tid, { status }), { onSuccess: refresh, onError: onErr })
  const addTask = useMutation(() => legalService.addTask(id, { label: newTask }), { onSuccess: () => { setNewTask(''); refresh() }, onError: onErr })
  const delTask = useMutation((tid) => legalService.deleteTask(tid), { onSuccess: refresh, onError: onErr })
  const setStatus = useMutation((status) => legalService.updateCase(id, { status }), { onSuccess: refresh, onError: onErr })
  const setNotary = useMutation((notary_id) => legalService.updateCase(id, { notary_id: notary_id || null }), { onSuccess: refresh, onError: onErr })

  if (isLoading) return <div className="p-8">Chargement…</div>
  const c = data.case
  const pct = c.tasks_total ? Math.round((c.tasks_done / c.tasks_total) * 100) : 0
  const notaries = notariesData?.notaries || []

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
      <div className="flex flex-wrap items-center gap-3 mt-2 mb-4">
        <span className="text-sm text-gray-500">{c.case_type === 'sale' ? 'Vente' : 'Location'}</span>
        <select value={c.status} onChange={(e) => setStatus.mutate(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900">
          <option value="open">Ouvert</option><option value="in_progress">En cours</option><option value="closed">Clôturé</option>
        </select>
        <select value={c.notary_id || ''} onChange={(e) => setNotary.mutate(e.target.value ? Number(e.target.value) : '')} className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900">
          <option value="">Aucun notaire</option>
          {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      <div className="mb-5">
        <div className="flex justify-between text-sm mb-1"><span>Progression</span><span>{c.tasks_done}/{c.tasks_total}</span></div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-primary-500" style={{ width: `${pct}%` }} /></div>
      </div>
      <ul className="space-y-2">
        {(c.tasks || []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2">
            <button onClick={() => toggle.mutate({ tid: t.id, status: NEXT[t.status] })}>
              {t.status === 'done' ? <FiCheckCircle className="text-green-600" /> : <FiCircle className={t.status === 'in_progress' ? 'text-amber-500' : 'text-gray-300'} />}
            </button>
            <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.label}</span>
            <button onClick={() => delTask.mutate(t.id)} className="text-red-500"><FiTrash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-4">
        <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Ajouter une étape…"
               className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <button disabled={!newTask} onClick={() => addTask.mutate()} className="btn-secondary inline-flex items-center gap-1 disabled:opacity-50"><FiPlus /> Ajouter</button>
      </div>
    </div>
  )
}
export default LegalCaseDetail
