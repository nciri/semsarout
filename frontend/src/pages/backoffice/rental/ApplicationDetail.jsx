import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiCheck, FiX, FiLock } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, Modal, Field, PRIMARY_BTN, SECONDARY_BTN, GatedNotice } from '../../../components/backoffice/ui'

const DOC_STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  validated: ['Validée', 'bg-emerald-50 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
}

function ApplicationDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: a, isLoading, error } = useQuery(['rental-application', id], () => rentalService.getApplication(id))
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const refresh = () => qc.invalidateQueries(['rental-application', id])
  const decide = useMutation((payload) => rentalService.decideApplication(id, payload), {
    onSuccess: () => { toast.success('Décision enregistrée'); setRejectOpen(false); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const validateDoc = useMutation(({ docId, status }) => rentalService.validateDocument(id, docId, { status }), {
    onSuccess: () => { toast.success('Pièce mise à jour'); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="Gestion locative" message="La gestion locative est réservée aux plans Pro et Entreprise." />
  if (isLoading) return <div className="p-6 text-gray-500">Chargement…</div>
  if (!a) return (
    <div className="p-6">
      <Link to="/backoffice/gestion-locative/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour</Link>
      <p className="mt-4 text-gray-500">Élément introuvable.</p>
    </div>
  )
  const docs = a.documents || []
  const pending = ['received', 'reviewing'].includes(a.status)
  const docColumns = [
    { header: 'Type', cell: (d) => <span className="text-gray-700">{d.doc_type}</span> },
    { header: 'Fichier', cell: (d) => <span className="text-gray-600">{d.filename || '—'}</span> },
    { header: 'Statut', cell: (d) => <StatusBadge label={DOC_STATUS[d.status]?.[0] || d.status} className={DOC_STATUS[d.status]?.[1]} /> },
    { header: '', align: 'right', cell: (d) => (
      <div className="flex gap-2 justify-end">
        <button disabled={validateDoc.isLoading} onClick={() => validateDoc.mutate({ docId: d.id, status: 'validated' })} className="text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"><FiCheck className="w-4 h-4" /> Valider</button>
        <button disabled={validateDoc.isLoading} onClick={() => validateDoc.mutate({ docId: d.id, status: 'rejected' })} className="text-red-600 hover:text-red-700 inline-flex items-center gap-1"><FiX className="w-4 h-4" /> Refuser</button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour aux candidatures</Link>
      <Panel title={`Candidature ${a.applicant_name || `#${a.id}`}`} action={pending && <div className="flex gap-2">
        <button disabled={decide.isLoading} onClick={() => decide.mutate({ decision: 'accepted' })} className={PRIMARY_BTN}><FiCheck className="w-5 h-5" /> Accepter</button>
        <button onClick={() => setRejectOpen(true)} className={SECONDARY_BTN}><FiX className="w-5 h-5" /> Refuser</button>
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-500">Statut</dt><dd className="mt-1"><StatusBadge label={a.status} /></dd></div>
          <div><dt className="text-gray-500">Email</dt><dd className="mt-1 text-gray-900">{a.applicant_email || '—'}</dd></div>
          <div><dt className="text-gray-500">Téléphone</dt><dd className="mt-1 text-gray-900">{a.applicant_phone || '—'}</dd></div>
          <div><dt className="text-gray-500">Revenu mensuel</dt><dd className="mt-1 text-gray-900">{a.monthly_income != null ? `${a.monthly_income} Đh` : '—'}</dd></div>
          <div><dt className="text-gray-500">Garant</dt><dd className="mt-1 text-gray-900">{a.guarantor_name || '—'}</dd></div>
          <div><dt className="text-gray-500">Bien (ID)</dt><dd className="mt-1 text-gray-900">{a.property_id}</dd></div>
        </dl>
      </Panel>
      <Panel title="Pièces justificatives">
        <DataTable columns={docColumns} rows={docs}
          empty={<EmptyState title="Aucune pièce" description="Le candidat n'a pas encore déposé de pièces." />} />
      </Panel>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Refuser la candidature"
        footer={<>
          <button onClick={() => setRejectOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={decide.isLoading} onClick={() => decide.mutate({ decision: 'rejected', reason })} className={PRIMARY_BTN}>Confirmer le refus</button>
        </>}>
        <Field label="Motif (facultatif, communiqué au candidat)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. dossier incomplet" />
      </Modal>
    </div>
  )
}
export default ApplicationDetail
