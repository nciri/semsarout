import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiEdit3, FiDownload, FiClock, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'
import { rentalService } from '../../services/rentalService'
import { Panel, StatusBadge, PRIMARY_BTN, SECONDARY_BTN } from './ui'

const SIG_STATUS_COLOR = {
  pending: 'bg-gray-100 text-gray-600',
  sent: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  voided: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-600',
}

function SignaturePanel({ docType, docId, managerName, managerEmail, disabled }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const key = ['signature', docType, docId]
  const { data: sig, error } = useQuery(key, () => rentalService.getSignature(docType, docId), { retry: false })
  async function openPdf(url) {
    try { const r = await api.get(url, { responseType: 'blob' }); const u = URL.createObjectURL(r.data); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
    catch { toast.error(t('backoffice:signature.pdfUnavailable')) }
  }
  const send = useMutation(() => rentalService.requestSignature(docType, docId, { manager_name: managerName, manager_email: managerEmail }), {
    onSuccess: () => { toast.success(t('backoffice:signature.status.sent')); qc.invalidateQueries(key) },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const none = error?.response?.status === 404
  return (
    <Panel title={t('backoffice:signature.title')}
      action={sig && <StatusBadge label={sig.status ? t(`backoffice:signature.status.${sig.status}`, { defaultValue: sig.status }) : sig.status} className={SIG_STATUS_COLOR[sig.status]} />}>
      {none || !sig ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{t('backoffice:signature.notSent')}</p>
          <button disabled={disabled || send.isLoading} onClick={() => send.mutate()} className={PRIMARY_BTN}><FiEdit3 className="w-5 h-5" /> {t('backoffice:signature.sendButton')}</button>
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
            <button onClick={() => openPdf(rentalService.signedPdfUrl(sig.id))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> {t('backoffice:signature.downloadSignedPdf')}</button>
          )}
          {sig.status === 'completed' && <p className="inline-flex items-center gap-1 text-emerald-700"><FiCheckCircle className="w-4 h-4" /> {t('backoffice:signature.signedByAll')}</p>}
        </div>
      )}
    </Panel>
  )
}
export default SignaturePanel
