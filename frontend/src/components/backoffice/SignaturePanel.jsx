import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiEdit3, FiDownload, FiClock, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'
import { rentalService } from '../../services/rentalService'
import { Panel, StatusBadge, PRIMARY_BTN, SECONDARY_BTN } from './ui'

const SIG_STATUS = {
  pending: ['En attente', 'bg-gray-100 text-gray-600'],
  sent: ['Envoyé en signature', 'bg-amber-100 text-amber-700'],
  in_progress: ['Signature en cours', 'bg-blue-100 text-blue-700'],
  completed: ['Signé', 'bg-emerald-50 text-emerald-700'],
  declined: ['Refusé', 'bg-red-100 text-red-700'],
  voided: ['Annulé', 'bg-gray-100 text-gray-600'],
  expired: ['Expiré', 'bg-gray-100 text-gray-600'],
}
async function openPdf(url) {
  try { const r = await api.get(url, { responseType: 'blob' }); const u = URL.createObjectURL(r.data); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
  catch { toast.error('PDF indisponible') }
}

function SignaturePanel({ docType, docId, managerName, managerEmail, disabled }) {
  const qc = useQueryClient()
  const key = ['signature', docType, docId]
  const { data: sig, error } = useQuery(key, () => rentalService.getSignature(docType, docId), { retry: false })
  const send = useMutation(() => rentalService.requestSignature(docType, docId, { manager_name: managerName, manager_email: managerEmail }), {
    onSuccess: () => { toast.success('Envoyé en signature'); qc.invalidateQueries(key) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const none = error?.response?.status === 404
  return (
    <Panel title="Signature électronique"
      action={sig && <StatusBadge label={SIG_STATUS[sig.status]?.[0] || sig.status} className={SIG_STATUS[sig.status]?.[1]} />}>
      {none || !sig ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Ce document n'a pas encore été envoyé en signature.</p>
          <button disabled={disabled || send.isLoading} onClick={() => send.mutate()} className={PRIMARY_BTN}><FiEdit3 className="w-5 h-5" /> Envoyer en signature</button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <ul className="space-y-1">
            {(sig.signers || []).map((s) => (
              <li key={s.order} className="flex items-center gap-2 text-gray-600">
                <FiClock className="w-4 h-4 text-gray-400" /> {s.order}. {s.name} — {s.email}
              </li>
            ))}
          </ul>
          {sig.status === 'completed' && sig.has_signed_pdf && (
            <button onClick={() => openPdf(rentalService.signedPdfUrl(sig.id))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> Télécharger le PDF signé</button>
          )}
          {sig.status === 'completed' && <p className="inline-flex items-center gap-1 text-emerald-700"><FiCheckCircle className="w-4 h-4" /> Signé par toutes les parties.</p>}
        </div>
      )}
    </Panel>
  )
}
export default SignaturePanel
