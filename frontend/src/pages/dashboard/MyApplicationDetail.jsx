import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiUploadCloud, FiDownload, FiFile } from 'react-icons/fi'
import api from '../../services/api'
import { applicantService } from '../../services/rentalService'

const STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  reviewing: ['En étude', 'bg-amber-100 text-amber-700'],
  accepted: ['Acceptée', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
  withdrawn: ['Retirée', 'bg-gray-100 text-gray-700'],
}
const DOC_STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  validated: ['Validée', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
}
const DOC_TYPES = [
  ['cin', "Pièce d'identité (CIN)"], ['bulletin_salaire', 'Bulletin de salaire'],
  ['contrat_travail', 'Contrat de travail'], ['avis_impot', "Avis d'imposition"],
  ['garant', 'Pièce du garant'], ['autre', 'Autre'],
]

async function openDoc(url) {
  try { const res = await api.get(url, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank') }
  catch { toast.error('Fichier indisponible') }
}

function MyApplicationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [docType, setDocType] = useState('cin')
  const { data: a, isLoading } = useQuery(['my-application', id], () => applicantService.myApplication(id))

  const upload = useMutation((file) => applicantService.uploadDocument(id, file, docType), {
    onSuccess: () => { toast.success('Pièce ajoutée'); qc.invalidateQueries(['my-application', id]) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const withdraw = useMutation(() => applicantService.withdraw(id), {
    onSuccess: () => { toast.success('Candidature retirée'); navigate('/dashboard/candidatures') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">Chargement…</div>
  if (!a) return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/dashboard/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour</Link>
      <p className="mt-4 text-gray-500">Candidature introuvable.</p>
    </div>
  )
  const docs = a.documents || []
  const canEdit = ['received', 'reviewing'].includes(a.status)
  const onPick = (e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) return toast.error('Fichier trop volumineux (max 10 Mo).'); upload.mutate(f) } e.target.value = '' }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link to="/dashboard/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Mes candidatures</Link>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Candidature — bien #{a.property_id}</h1>
            <p className="text-sm text-gray-500 mt-1">Déposée le {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('fr-FR') : '—'}</p>
          </div>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS[a.status]?.[1] || 'bg-gray-100 text-gray-700'}`}>{STATUS[a.status]?.[0] || a.status}</span>
        </div>
        {a.status === 'rejected' && a.decision_reason && <p className="mt-3 text-sm text-red-700">Motif : {a.decision_reason}</p>}
        {a.status === 'accepted' && <p className="mt-3 text-sm text-emerald-700">Félicitations, votre dossier a été retenu — l'agence vous recontactera.</p>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Pièces justificatives</h2>
          {canEdit && (
            <div className="flex items-center gap-2">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button disabled={upload.isLoading} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                <FiUploadCloud className="w-4 h-4" /> Ajouter
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
            </div>
          )}
        </div>
        {docs.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune pièce déposée. Ajoutez vos justificatifs (CIN, revenus, garant…).</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <span className="inline-flex items-center gap-2 text-gray-800"><FiFile className="w-4 h-4 text-gray-400" /> {(DOC_TYPES.find(([v]) => v === d.doc_type)?.[1]) || d.doc_type} <span className="text-gray-400 text-sm">— {d.filename}</span></span>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DOC_STATUS[d.status]?.[1] || 'bg-gray-100 text-gray-700'}`}>{DOC_STATUS[d.status]?.[0] || d.status}</span>
                  <button onClick={() => openDoc(applicantService.documentUrl(id, d.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <button onClick={() => withdraw.mutate()} disabled={withdraw.isLoading} className="text-sm text-red-600 hover:text-red-700">Retirer ma candidature</button>
      )}
    </div>
  )
}
export default MyApplicationDetail
