import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { contractService } from '../../../services/contractService'

const STATUS = { draft: 'Brouillon', finalized: 'Finalisé', signed: 'Signé' }

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

  if (isLoading) return <div className="p-8">Chargement…</div>

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
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly}
                 className="text-xl font-bold text-gray-900 border-b border-transparent focus:border-gray-300 outline-none" />
          <span className="ml-3 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{STATUS[contract.status]}</span>
        </div>
        <div className="flex gap-2">
          {!readOnly && <button onClick={() => save.mutate()} className="btn-secondary text-sm">Enregistrer</button>}
          {contract.status === 'draft' && <button onClick={() => finalize.mutate()} className="btn-primary text-sm">Finaliser</button>}
          {contract.status !== 'draft' && <button onClick={downloadPdf} className="btn-secondary text-sm">Télécharger PDF</button>}
          {contract.status === 'finalized' && <button onClick={() => sign.mutate()} className="btn-primary text-sm">Marquer signé</button>}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        <ReactQuill theme="snow" value={html} onChange={setHtml} readOnly={readOnly} />
      </div>
      {readOnly && <p className="text-xs text-gray-400 mt-2">Contrat {STATUS[contract.status].toLowerCase()} — édition verrouillée.</p>}
    </div>
  )
}
export default ContractEditor
