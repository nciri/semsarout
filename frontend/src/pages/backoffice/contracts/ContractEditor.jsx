import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { FiArrowLeft, FiSave, FiCheck, FiDownload, FiEdit3 } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import { StatusBadge } from '../../../components/backoffice/ui'

const STATUS = {
  draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  finalized: ['Finalisé', 'bg-blue-100 text-blue-700'],
  signed: ['Signé', 'bg-emerald-50 text-emerald-700'],
}
const SECONDARY_BTN = 'inline-flex items-center gap-2 px-3.5 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors'
const PRIMARY_BTN = 'inline-flex items-center gap-2 px-3.5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors'

function ContractEditor() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery(['contract', id], () => contractService.get(id))
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (data?.contract) { setHtml(data.contract.body_html || ''); setTitle(data.contract.title || '') }
  }, [data])

  const contract = data?.contract
  const readOnly = contract && contract.status !== 'draft'
  const refresh = () => qc.invalidateQueries(['contract', id])
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')

  const save = useMutation(() => contractService.update(id, { title, body_html: html }),
    { onSuccess: () => { toast.success('Enregistré'); refresh() }, onError: onErr })
  const finalize = useMutation(() => contractService.finalize(id),
    { onSuccess: () => { toast.success('Contrat finalisé'); refresh() }, onError: onErr })
  const sign = useMutation(() => contractService.markSigned(id),
    { onSuccess: () => { toast.success('Marqué signé'); refresh() }, onError: onErr })

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-4 w-24 bg-gray-200 rounded" /><div className="h-10 bg-gray-200 rounded w-1/2" /><div className="h-96 bg-gray-100 rounded-xl" /></div>

  const downloadPdf = async () => {
    const res = await fetch(contractService.pdfUrl(id), {
      headers: { Authorization: `Bearer ${JSON.parse(localStorage.getItem('auth-storage'))?.state?.accessToken}` },
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${title}.pdf`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <Link to="/backoffice/contrats" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Contrats
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={readOnly}
            className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-transparent focus:border-primary-400 outline-none disabled:cursor-default min-w-0"
          />
          <StatusBadge label={STATUS[contract.status]?.[0]} className={STATUS[contract.status]?.[1]} />
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && <button onClick={() => save.mutate()} className={SECONDARY_BTN}><FiSave className="w-4 h-4" /> Enregistrer</button>}
          {contract.status === 'draft' && <button onClick={() => finalize.mutate()} className={PRIMARY_BTN}><FiCheck className="w-4 h-4" /> Finaliser</button>}
          {contract.status !== 'draft' && <button onClick={downloadPdf} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> Télécharger PDF</button>}
          {contract.status === 'finalized' && <button onClick={() => sign.mutate()} className={PRIMARY_BTN}><FiEdit3 className="w-4 h-4" /> Marquer signé</button>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <ReactQuill theme="snow" value={html} onChange={setHtml} readOnly={readOnly} />
      </div>
      {readOnly && (
        <p className="text-xs text-gray-400">Contrat {STATUS[contract.status]?.[0].toLowerCase()} — édition verrouillée.</p>
      )}
    </div>
  )
}
export default ContractEditor
