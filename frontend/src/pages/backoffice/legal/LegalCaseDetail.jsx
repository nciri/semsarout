import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiCheckCircle, FiCircle, FiTrash2, FiPlus, FiArrowLeft } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

function LegalCaseDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['legal-case', id], () => legalService.getCase(id))
  const { data: notariesData } = useQuery('notaries', () => legalService.listNotaries())
  const [newTask, setNewTask] = useState('')

  const refresh = () => qc.invalidateQueries(['legal-case', id])
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const toggle = useMutation(({ tid, status }) => legalService.updateTask(tid, { status }), { onSuccess: refresh, onError: onErr })
  const addTask = useMutation(() => legalService.addTask(id, { label: newTask }), { onSuccess: () => { setNewTask(''); refresh() }, onError: onErr })
  const delTask = useMutation((tid) => legalService.deleteTask(tid), { onSuccess: refresh, onError: onErr })
  const setStatus = useMutation((status) => legalService.updateCase(id, { status }), { onSuccess: refresh, onError: onErr })
  const setNotary = useMutation((notary_id) => legalService.updateCase(id, { notary_id: notary_id || null }), { onSuccess: refresh, onError: onErr })

  if (isLoading) return <div className="max-w-3xl animate-pulse space-y-4"><div className="h-4 w-24 bg-gray-200 rounded" /><div className="h-32 bg-gray-100 rounded-xl" /><div className="h-40 bg-gray-100 rounded-xl" /></div>
  if (isError || !data?.case) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
        Dossier introuvable. <Link to="/backoffice/notaires/dossiers" className="text-primary-600 hover:underline">Retour aux dossiers</Link>
      </div>
    )
  }
  const c = data.case
  const pct = c.tasks_total ? Math.round((c.tasks_done / c.tasks_total) * 100) : 0
  const notaries = notariesData?.notaries || []

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/backoffice/notaires/dossiers" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Dossiers juridiques
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {c.case_type === 'sale' ? 'Vente' : 'Location'}
          </span>
          <label className="text-sm text-gray-500">Statut
            <select value={c.status} onChange={(e) => setStatus.mutate(e.target.value)} className="ml-2 px-2 py-1 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="open">Ouvert</option><option value="in_progress">En cours</option><option value="closed">Clôturé</option>
            </select>
          </label>
          <label className="text-sm text-gray-500">Notaire
            <select value={c.notary_id || ''} onChange={(e) => setNotary.mutate(e.target.value ? Number(e.target.value) : '')} className="ml-2 px-2 py-1 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Aucun</option>
              {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-sm text-gray-500 mb-1"><span>Progression</span><span className="tabular-nums">{c.tasks_done}/{c.tasks_total} · {pct}%</span></div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Étapes du dossier</h2>
        <ul className="space-y-2">
          {(c.tasks || []).map((t) => (
            <li key={t.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors">
              <button onClick={() => toggle.mutate({ tid: t.id, status: NEXT[t.status] })} className="flex-shrink-0" title="Changer le statut">
                {t.status === 'done'
                  ? <FiCheckCircle className="w-5 h-5 text-emerald-600" />
                  : <FiCircle className={`w-5 h-5 ${t.status === 'in_progress' ? 'text-amber-500' : 'text-gray-300'}`} />}
              </button>
              <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.label}</span>
              <button onClick={() => delTask.mutate(t.id)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Supprimer">
                <FiTrash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {(c.tasks || []).length === 0 && <li className="text-sm text-gray-400 py-2">Aucune étape pour l'instant.</li>}
        </ul>
        <div className="flex gap-2 mt-4">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newTask) addTask.mutate() }}
            placeholder="Ajouter une étape…"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button disabled={!newTask || addTask.isLoading} onClick={() => addTask.mutate()} className="inline-flex items-center gap-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <FiPlus className="w-4 h-4" /> Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}
export default LegalCaseDetail
