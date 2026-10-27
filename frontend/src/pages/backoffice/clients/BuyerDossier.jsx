import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheck, FiDownload, FiUploadCloud, FiX } from 'react-icons/fi'
import api from '../../../services/api'
import { BUYER_DOC_TONE, BUYER_DOC_TYPES, FINANCING_TONE, buyerDossierService } from '../../../services/buyerDossierService'
import { useFormat } from '../../../utils/format'
import { Chip, IconAction, Kv, TD, TH } from '../components/kit'

const P = 'crm.clients.buyerDossier'
const MAX_SIZE = 10 * 1024 * 1024

async function openDoc(url, onError) {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(res.data)
    window.open(objectUrl, '_blank')
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
  } catch { onError() }
}

/**
 * Dossier d'achat d'un client : ce qu'il peut réellement financer, et les pièces qui le
 * prouvent. Le budget réaliste vient du service (apport + capacité d'emprunt) ; l'agence
 * saisit les trois paramètres, l'acquéreur dépose les pièces depuis son espace.
 */
export default function BuyerDossier({ client }) {
  const { t } = useTranslation('backoffice')
  const { fmtNumber } = useFormat()
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [docType, setDocType] = useState(BUYER_DOC_TYPES[0])
  const [editing, setEditing] = useState(false)
  const f = client.financing || {}
  const [form, setForm] = useState({
    down_payment: f.down_payment ?? '',
    max_monthly_payment: f.max_monthly_payment ?? '',
    has_bank_preapproval: Boolean(f.has_bank_preapproval),
  })

  const refresh = () => qc.invalidateQueries(['backoffice-client', String(client.id)])
  const onError = (e) => toast.error(e?.response?.data?.error || t('crm.shared.loadError'))

  const save = useMutation(() => buyerDossierService.saveFinancing(client.id, {
    down_payment: form.down_payment === '' ? null : Number(form.down_payment),
    max_monthly_payment: form.max_monthly_payment === '' ? null : Number(form.max_monthly_payment),
    has_bank_preapproval: form.has_bank_preapproval,
  }), { onSuccess: () => { setEditing(false); refresh() }, onError })

  const upload = useMutation((file) => buyerDossierService.uploadDocument(client.id, file, docType), {
    onSuccess: () => { toast.success(t(`${P}.docs.added`)); refresh() }, onError,
  })
  const setStatus = useMutation(({ docId, status }) => buyerDossierService.setDocumentStatus(client.id, docId, status),
    { onSuccess: refresh, onError })

  const docs = client.documents || []
  const missing = f.missing_documents || []
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
  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none'

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 pb-6 pt-5 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-bold">{t(`${P}.title`)}</h2>
        <div className="flex items-center gap-2">
          <Chip tone={FINANCING_TONE[f.verdict] || 'neutral'}>{t(`${P}.verdict.${f.verdict || 'unknown'}`)}</Chip>
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
            {t(`${P}.${editing ? 'cancel' : 'edit'}`)}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-semibold text-gray-700">{t(`${P}.fields.downPayment`)}</span>
            <input type="number" min="0" className={field} value={form.down_payment}
              onChange={(e) => setForm((v) => ({ ...v, down_payment: e.target.value }))} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-semibold text-gray-700">{t(`${P}.fields.maxMonthlyPayment`)}</span>
            <input type="number" min="0" className={field} value={form.max_monthly_payment}
              onChange={(e) => setForm((v) => ({ ...v, max_monthly_payment: e.target.value }))} />
          </label>
          <label className="mt-6 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.has_bank_preapproval}
              onChange={(e) => setForm((v) => ({ ...v, has_bank_preapproval: e.target.checked }))} />
            {t(`${P}.fields.preapproval`)}
          </label>
          <div className="sm:col-span-3">
            <button type="button" disabled={save.isLoading} onClick={() => save.mutate()}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {t(`${P}.save`)}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kv label={t(`${P}.fields.downPayment`)} value={money(f.down_payment)} />
          <Kv label={t(`${P}.fields.borrowingCapacity`)} value={money(f.borrowing_capacity)}
            sub={t(`${P}.loanTerms`, { rate: f.loan_rate_pct, years: f.loan_years })} />
          <Kv label={t(`${P}.fields.realisticBudget`)} value={money(f.realistic_budget)} />
          <Kv label={t(`${P}.fields.declaredBudget`)} value={money(f.declared_budget)}
            sub={f.gap == null ? undefined
              : t(`${P}.${f.gap < 0 ? 'gapShort' : 'gapOver'}`, { amount: money(Math.abs(f.gap)) })} />
        </div>
      )}

      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-[13px] font-bold">{t(`${P}.docs.title`)}</h3>
          <div className="flex items-center gap-2">
            <select aria-label={t(`${P}.docs.typeLabel`)} value={docType} onChange={(e) => setDocType(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
              {BUYER_DOC_TYPES.map((code) => <option key={code} value={code}>{docLabel(code)}</option>)}
            </select>
            <button type="button" disabled={upload.isLoading} onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50">
              <FiUploadCloud className="h-4 w-4" aria-hidden="true" />{t(`${P}.docs.add`)}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={pick} />
          </div>
        </div>

        {missing.length > 0 && (
          <p className="mb-3 text-[13px] text-amber-700">
            {t(`${P}.docs.missing`, { list: missing.map(docLabel).join(', ') })}
          </p>
        )}

        {docs.length === 0 ? (
          <p className="text-[13px] text-gray-500">{t(`${P}.docs.empty`)}</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={TH}>{t(`${P}.docs.columns.type`)}</th>
                <th className={TH}>{t(`${P}.docs.columns.file`)}</th>
                <th className={TH}>{t(`${P}.docs.columns.status`)}</th>
                <th className={`${TH} text-end`}><span className="sr-only">{t(`${P}.docs.columns.actions`)}</span></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className={TD}>{docLabel(d.doc_type)}</td>
                  <td className={TD}>{d.filename || '—'}</td>
                  <td className={TD}><Chip tone={BUYER_DOC_TONE[d.status] || 'neutral'}>{t(`${P}.docs.status.${d.status}`, { defaultValue: d.status })}</Chip></td>
                  <td className={`${TD} text-end`}>
                    <div className="flex justify-end">
                      <IconAction icon={FiDownload} label={t(`${P}.docs.download`)}
                        onClick={() => openDoc(buyerDossierService.documentUrl(client.id, d.id), () => toast.error(t(`${P}.docs.unavailable`)))} />
                      <IconAction icon={FiCheck} label={t(`${P}.docs.validate`)} disabled={setStatus.isLoading}
                        onClick={() => setStatus.mutate({ docId: d.id, status: 'validated' })} className="text-emerald-700 hover:bg-emerald-50" />
                      <IconAction icon={FiX} label={t(`${P}.docs.reject`)} tone="danger" tipAlign="end" disabled={setStatus.isLoading}
                        onClick={() => setStatus.mutate({ docId: d.id, status: 'rejected' })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
