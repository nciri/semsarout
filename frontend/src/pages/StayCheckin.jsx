import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheckCircle, FiFileText, FiUpload } from 'react-icons/fi'
import { stayCheckinService, GUEST_DOCUMENT_TYPES } from '../services/stayService'
import { useFormat } from '../utils/format'

const EMPTY = { full_name: '', document_type: 'cin', document_number: '', nationality: '', birth_date: '' }
const FIELD = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500'
const LABEL = 'mb-1 block text-sm font-medium text-gray-700'

/** Enregistrement d'un séjour par le voyageur : le lien privé tient lieu d'identification. */
function StayCheckin() {
  const { token } = useParams()
  const { t } = useTranslation(['public', 'common'])
  const { fmtDate } = useFormat()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [files, setFiles] = useState({})
  const [signer, setSigner] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const { data, isLoading, error } = useQuery(['stay-checkin', token], () => stayCheckinService.view(token),
    { retry: false })
  const refresh = () => qc.invalidateQueries(['stay-checkin', token])
  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))

  const declare = useMutation(() => stayCheckinService.declare(token, form), {
    onSuccess: () => { toast.success(t('public:stayCheckin.toasts.added')); setForm(EMPTY); refresh() },
    onError: fail,
  })
  const upload = useMutation(({ guestId, file }) => stayCheckinService.uploadDoc(token, guestId, file), {
    onSuccess: () => { toast.success(t('public:stayCheckin.toasts.uploaded')); refresh() },
    onError: fail,
  })
  const sign = useMutation(() => stayCheckinService.signContract(token, signer.trim()), {
    onSuccess: () => { toast.success(t('public:stayCheckin.contract.signed')); setSigner(''); refresh() },
    onError: fail,
  })
  const submit = useMutation(() => stayCheckinService.submit(token), {
    onSuccess: () => { toast.success(t('public:stayCheckin.toasts.submitted')); refresh() },
    onError: fail,
  })

  if (isLoading) {
    return <div className="mx-auto my-16 h-40 w-full max-w-2xl animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none" aria-busy="true" />
  }
  if (error) {
    return (
      <div className="mx-auto my-16 w-full max-w-xl rounded-xl border border-gray-200 bg-white p-8 text-center">
        <h1 className="font-display text-xl font-bold">{t('public:stayCheckin.invalid.title')}</h1>
        <p className="mt-2 text-gray-500">{error.response?.data?.error || t('public:stayCheckin.invalid.description')}</p>
      </div>
    )
  }

  const stay = data.stay
  const guests = data.guests || []
  const done = data.status === 'submitted'
  const contract = data.contract
  const day = (iso) => (iso ? fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

  return (
    <div className="mx-auto my-10 grid w-full max-w-2xl gap-5 px-4">
      <header>
        <h1 className="font-display text-[24px] font-extrabold leading-tight tracking-tight">
          {t('public:stayCheckin.title')}
        </h1>
        <p className="mt-1 text-gray-600">
          {[stay.property_title, `${day(stay.check_in)} → ${day(stay.check_out)}`].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-[13px] text-gray-500">{t('public:stayCheckin.why')}</p>
      </header>

      {done && (
        <div className="flex items-start gap-2.5 rounded-lg bg-green-50 px-3 py-2.5 text-[13px] text-green-900">
          <FiCheckCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>{t('public:stayCheckin.submitted')}</span>
        </div>
      )}

      <section className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-display text-[15px] font-bold">
          {t('public:stayCheckin.declared', { count: guests.length, expected: stay.expected_guests || guests.length })}
        </h2>
        {!guests.length && <p className="text-sm text-gray-500">{t('public:stayCheckin.noGuest')}</p>}
        {guests.map((g) => (
          <div key={g.id} className="grid gap-1.5 rounded-lg border border-gray-100 p-3">
            <div>
              <b className="font-semibold">{g.full_name}</b>
              {g.is_lead && <span className="ms-2 text-xs text-primary-700">{t('public:stayCheckin.lead')}</span>}
            </div>
            {g.documents?.length > 0 ? (
              <p className="text-xs text-green-700">{t('public:stayCheckin.documentReceived', { count: g.documents.length })}</p>
            ) : (
              <label className="grid gap-1 text-[13px] font-medium text-gray-700">
                {t('public:stayCheckin.documentLabel')}
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setFiles((f) => ({ ...f, [g.id]: e.target.files?.[0] || null }))}
                  className="text-[13px]" />
                <span>
                  <button type="button" disabled={!files[g.id] || upload.isLoading}
                    onClick={() => upload.mutate({ guestId: g.id, file: files[g.id] })}
                    className="mt-1 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                    <FiUpload className="h-4 w-4" aria-hidden="true" />
                    {t('public:stayCheckin.upload')}
                  </button>
                </span>
              </label>
            )}
            {g.status === 'rejected' && (
              <p className="text-xs text-red-700">{g.review_note || t('public:stayCheckin.rejected')}</p>
            )}
          </div>
        ))}
      </section>

      {contract && (
        <section className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
            <FiFileText className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {t('public:stayCheckin.contract.title')}
          </h2>
          {contract.status === 'signed' ? (
            <p className="text-sm text-green-800">{t('public:stayCheckin.contract.done')}</p>
          ) : (
            <>
              <p className="text-[13px] text-gray-600">{t('public:stayCheckin.contract.help')}</p>
              <div>
                <label className={LABEL} htmlFor="contract-signer">
                  {t('public:stayCheckin.contract.nameLabel')}
                </label>
                <input id="contract-signer" value={signer} onChange={(e) => setSigner(e.target.value)}
                  className={FIELD} />
              </div>
              <div>
                <button type="button" disabled={signer.trim().length < 2 || sign.isLoading}
                  onClick={() => sign.mutate()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50">
                  {t('public:stayCheckin.contract.sign')}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-display text-[15px] font-bold">{t('public:stayCheckin.addTitle')}</h2>
        <div>
          <label className={LABEL} htmlFor="guest-name">{t('public:stayCheckin.nameLabel')}</label>
          <input id="guest-name" value={form.full_name} onChange={set('full_name')} className={FIELD} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="guest-doc-type">{t('public:stayCheckin.docTypeLabel')}</label>
            <select id="guest-doc-type" value={form.document_type} onChange={set('document_type')} className={FIELD}>
              {GUEST_DOCUMENT_TYPES.map((x) => (
                <option key={x} value={x}>{t(`public:stayCheckin.documentType.${x}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="guest-doc-number">{t('public:stayCheckin.docNumberLabel')}</label>
            <input id="guest-doc-number" value={form.document_number} onChange={set('document_number')} className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="guest-nationality">{t('public:stayCheckin.nationalityLabel')}</label>
            <input id="guest-nationality" value={form.nationality} onChange={set('nationality')} className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="guest-birth">{t('public:stayCheckin.birthLabel')}</label>
            <input id="guest-birth" type="date" value={form.birth_date} onChange={set('birth_date')} className={FIELD} />
          </div>
        </div>
        <div>
          <button type="button" disabled={form.full_name.trim().length < 2 || declare.isLoading}
            onClick={() => declare.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50">
            {t('public:stayCheckin.add')}
          </button>
        </div>
      </section>

      <div>
        <button type="button" disabled={!guests.length || submit.isLoading || done}
          onClick={() => submit.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-midnight px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          <FiCheckCircle className="h-4 w-4" aria-hidden="true" />
          {t('public:stayCheckin.submit')}
        </button>
        <p className="mt-1.5 text-[12.5px] text-gray-500">{t('public:stayCheckin.submitHelp')}</p>
      </div>
    </div>
  )
}
export default StayCheckin
