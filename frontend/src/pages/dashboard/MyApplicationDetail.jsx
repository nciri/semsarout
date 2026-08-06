import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiUploadCloud, FiDownload, FiFile } from 'react-icons/fi'
import api from '../../services/api'
import { applicantService } from '../../services/rentalService'
import DirIcon from '../../components/common/DirIcon'
import { APP_STATUS, DOC_STATUS, DOC_TYPES } from './applicationStatus'
import { useFormat } from '../../utils/format'

async function openDoc(url, t) {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const u = URL.createObjectURL(res.data)
    window.open(u, '_blank')
    setTimeout(() => URL.revokeObjectURL(u), 60000)
  } catch { toast.error(t('dashboard:applicationDetail.toasts.fileUnavailable')) }
}

function MyApplicationDetail() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { fmtDate } = useFormat()
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [docType, setDocType] = useState('cin')
  const { data: a, isLoading } = useQuery(['my-application', id], () => applicantService.myApplication(id))

  const upload = useMutation((file) => applicantService.uploadDocument(id, file, docType), {
    onSuccess: () => { toast.success(t('dashboard:applicationDetail.toasts.docAdded')); qc.invalidateQueries(['my-application', id]) },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.generic')),
  })
  const withdraw = useMutation(() => applicantService.withdraw(id), {
    onSuccess: () => { toast.success(t('dashboard:applicationDetail.toasts.withdrawn')); navigate('/dashboard/candidatures') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.generic')),
  })

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">{t('dashboard:shared.loading')}</div>
  if (!a) return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/dashboard/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('dashboard:applicationDetail.back')}</Link>
      <p className="mt-4 text-gray-500">{t('dashboard:applicationDetail.notFound')}</p>
    </div>
  )
  const docs = a.documents || []
  const canEdit = ['received', 'reviewing'].includes(a.status)
  const onPick = (e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) return toast.error(t('dashboard:applicationDetail.toasts.fileTooLarge')); upload.mutate(f) } e.target.value = '' }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link to="/dashboard/candidatures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('dashboard:applicationDetail.backList')}</Link>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('dashboard:applicationDetail.title', { property: a.property_title || t('dashboard:applicationDetail.propertyFallback', { id: a.property_id }) })}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('dashboard:applicationDetail.submittedOn', { date: a.submitted_at ? fmtDate(a.submitted_at) : '—' })}</p>
          </div>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${APP_STATUS[a.status]?.className || 'bg-gray-100 text-gray-700'}`}>
            {APP_STATUS[a.status] ? t(`common:${APP_STATUS[a.status].labelKey}`) : a.status}
          </span>
        </div>
        {a.status === 'rejected' && a.decision_reason && <p className="mt-3 text-sm text-red-700">{t('dashboard:applicationDetail.rejectionReason', { reason: a.decision_reason })}</p>}
        {a.status === 'accepted' && <p className="mt-3 text-sm text-emerald-700">{t('dashboard:applicationDetail.acceptedNote')}</p>}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t('dashboard:applicationDetail.documents.title')}</h2>
          {canEdit && (
            <div className="flex items-center gap-2">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {DOC_TYPES.map(([v, labelKey]) => <option key={v} value={v}>{t(`common:${labelKey}`)}</option>)}
              </select>
              <button disabled={upload.isLoading} onClick={() => fileRef.current?.click()} className="btn-primary gap-2">
                <FiUploadCloud className="w-4 h-4" /> {t('dashboard:shared.actions.add')}
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
            </div>
          )}
        </div>
        {docs.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('dashboard:applicationDetail.documents.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <span className="inline-flex items-center gap-2 text-gray-800">
                  <FiFile className="w-4 h-4 text-gray-400" />
                  {(() => {
                    const labelKey = DOC_TYPES.find(([v]) => v === d.doc_type)?.[1]
                    return labelKey ? t(`common:${labelKey}`) : d.doc_type
                  })()}
                  <span className="text-gray-400 text-sm">{t('dashboard:applicationDetail.documents.filenameSuffix', { filename: d.filename })}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DOC_STATUS[d.status]?.className || 'bg-gray-100 text-gray-700'}`}>
                    {DOC_STATUS[d.status] ? t(`common:${DOC_STATUS[d.status].labelKey}`) : d.status}
                  </span>
                  <button onClick={() => openDoc(applicantService.documentUrl(id, d.id), t)} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <button onClick={() => withdraw.mutate()} disabled={withdraw.isLoading} className="text-sm text-red-600 hover:text-red-700">{t('dashboard:applicationDetail.withdrawButton')}</button>
      )}
    </div>
  )
}
export default MyApplicationDetail
