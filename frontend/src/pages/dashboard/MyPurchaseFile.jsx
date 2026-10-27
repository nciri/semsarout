import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheckCircle, FiDownload, FiFile, FiTrash2, FiUploadCloud } from 'react-icons/fi'
import api from '../../services/api'
import { BUYER_DOC_TYPES, buyerDossierService } from '../../services/buyerDossierService'
import { useFormat } from '../../utils/format'

const P = 'dashboard:purchaseFile'
const MAX_SIZE = 10 * 1024 * 1024
const STATUS_CLASS = {
  received: 'bg-blue-100 text-blue-700',
  validated: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

// Le type d'une pièce vient de son dépôt : ouvert tel quel, un blob same-origin typé
// text/html exécuterait du script. On ne rend inline que des formats inertes.
const INLINE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const safeBlob = (data) => (INLINE_TYPES.includes(data.type) ? data : new Blob([data], { type: 'application/octet-stream' }))

async function openDoc(url, onError) {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(safeBlob(res.data))
    window.open(objectUrl, '_blank')
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
  } catch { onError() }
}

/** Un dossier par agence qui suit l'acquéreur : chacune réclame ses propres pièces. */
function Dossier({ dossier }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const { fmtNumber } = useFormat()
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [docType, setDocType] = useState(BUYER_DOC_TYPES[0])
  const q = dossier.qualification || {}
  const docs = dossier.documents || []
  const missing = q.missing_documents || []

  const refresh = () => qc.invalidateQueries('my-purchase-file')
  const onError = (e) => toast.error(e?.response?.data?.error || t('common:errors.generic'))
  const upload = useMutation((file) => buyerDossierService.uploadMyDocument(dossier.client_id, file, docType), {
    onSuccess: () => { toast.success(t(`${P}.docs.added`)); refresh() }, onError,
  })
  const remove = useMutation((docId) => buyerDossierService.deleteMyDocument(dossier.client_id, docId), {
    onSuccess: refresh, onError,
  })

  const money = (v) => (v == null ? '—' : `${fmtNumber(Math.round(v))} ${t(`${P}.currency`)}`)
  const docLabel = (code) => t(`${P}.docTypes.${code}`, { defaultValue: code })
  const pick = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > MAX_SIZE) toast.error(t(`${P}.docs.tooLarge`))
      else upload.mutate(file)
    }
    e.target.value = ''
  }

  return (
    <div className="card space-y-5 p-6">
      <div>
        <h2 className="font-semibold text-gray-900">{t(`${P}.dossierTitle`)}</h2>
        <p className="mt-1 text-sm text-gray-500">{t(`${P}.dossierSubtitle`)}</p>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">{t(`${P}.fields.declaredBudget`)}</dt>
          <dd className="mt-1 tabular-nums text-gray-900">{money(q.declared_budget)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">{t(`${P}.fields.realisticBudget`)}</dt>
          <dd className="mt-1 tabular-nums text-gray-900">{money(q.realistic_budget)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">{t(`${P}.fields.preapproval`)}</dt>
          <dd className="mt-1 text-gray-900">{t(`${P}.${q.has_bank_preapproval ? 'yes' : 'no'}`)}</dd>
        </div>
      </dl>

      <div className="border-t border-gray-100 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900">{t(`${P}.docs.title`)}</h3>
          <div className="flex items-center gap-2">
            <select aria-label={t(`${P}.docs.typeLabel`)} value={docType} onChange={(e) => setDocType(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              {BUYER_DOC_TYPES.map((code) => <option key={code} value={code}>{docLabel(code)}</option>)}
            </select>
            <button type="button" disabled={upload.isLoading} onClick={() => fileRef.current?.click()} className="btn-primary gap-2">
              <FiUploadCloud className="h-4 w-4" aria-hidden="true" />{t(`${P}.docs.add`)}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={pick} />
          </div>
        </div>

        {missing.length > 0 ? (
          <p className="mb-3 text-sm text-amber-700">{t(`${P}.docs.missing`, { list: missing.map(docLabel).join(', ') })}</p>
        ) : (
          <p className="mb-3 inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <FiCheckCircle className="h-4 w-4" aria-hidden="true" />{t(`${P}.docs.complete`)}
          </p>
        )}

        {docs.length === 0 ? (
          <p className="text-sm text-gray-500">{t(`${P}.docs.empty`)}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="inline-flex items-center gap-2 text-gray-800">
                  <FiFile className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {docLabel(d.doc_type)}
                  <span className="text-sm text-gray-400">{d.filename}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[d.status] || 'bg-gray-100 text-gray-700'}`}>
                    {t(`${P}.docs.status.${d.status}`, { defaultValue: d.status })}
                  </span>
                  <button type="button" aria-label={t(`${P}.docs.download`)} className="text-primary-600 hover:text-primary-700"
                    onClick={() => openDoc(buyerDossierService.myDocumentUrl(dossier.client_id, d.id), () => toast.error(t(`${P}.docs.unavailable`)))}>
                    <FiDownload className="h-4 w-4" />
                  </button>
                  {d.status !== 'validated' && (
                    <button type="button" aria-label={t(`${P}.docs.remove`)} className="text-red-600 hover:text-red-700"
                      disabled={remove.isLoading} onClick={() => remove.mutate(d.id)}>
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Espace acquéreur : les pièces que l'agence réclame pour instruire un achat, déposées
 * une fois ici au lieu de circuler par e-mail.
 */
function MyPurchaseFile() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { data, isLoading } = useQuery('my-purchase-file', buyerDossierService.myDossiers)
  const dossiers = data?.dossiers || []

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t(`${P}.title`)}</h1>
        <p className="mt-1 text-gray-600">{t(`${P}.subtitle`)}</p>
      </div>

      {isLoading ? (
        <p className="text-gray-500">{t('dashboard:shared.loading')}</p>
      ) : dossiers.length === 0 ? (
        <div className="card p-6"><p className="text-gray-500">{t(`${P}.empty`)}</p></div>
      ) : (
        dossiers.map((d) => <Dossier key={d.client_id} dossier={d} />)
      )}
    </div>
  )
}
export default MyPurchaseFile
