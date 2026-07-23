import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { contractService } from '../../../services/contractService'

const TYPES = [['mandate_sale', 'Mandat de vente'], ['mandate_rental', 'Mandat location/gestion'],
  ['compromise', 'Compromis'], ['lease', 'Bail'], ['other', 'Autre']]
const FIELDS = ['agency_name', 'agent_name', 'client_name', 'property_address', 'property_price',
  'property_surface', 'commission_rate', 'date']

function TemplatesManager() {
  const qc = useQueryClient()
  const { data } = useQuery('contract-templates', () => contractService.listTemplates())
  const canManage = data?.can_manage_templates
  const [name, setName] = useState('')
  const [docType, setDocType] = useState('other')
  const [body, setBody] = useState('')

  const create = useMutation(() => contractService.createTemplate({ name, document_type: docType, body_html: body }), {
    onSuccess: () => { toast.success('Modèle créé'); setName(''); setBody(''); qc.invalidateQueries('contract-templates') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => contractService.deleteTemplate(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('contract-templates') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (data && !canManage) {
    return <div className="p-8 text-center text-gray-500">Les modèles personnalisés sont réservés au plan Entreprise.</div>
  }
  const custom = (data?.templates || []).filter((t) => !t.is_global)

  return (
    <div className="p-6 grid lg:grid-cols-2 gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Modèles personnalisés</h1>
        <ul className="space-y-2">
          {custom.map((t) => (
            <li key={t.id} className="flex justify-between items-center bg-white border border-gray-200 rounded-lg px-4 py-2">
              <span>{t.name} <span className="text-xs text-gray-400">({t.document_type})</span></span>
              <button onClick={() => del.mutate(t.id)} className="text-red-600 text-sm">Supprimer</button>
            </li>
          ))}
          {custom.length === 0 && <li className="text-gray-400 text-sm">Aucun modèle personnalisé.</li>}
        </ul>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Nouveau modèle</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du modèle"
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900" />
        <select value={docType} onChange={(e) => setDocType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900">
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="text-xs text-gray-500 mb-2">Champs : {FIELDS.map((f) => `{{${f}}}`).join(' · ')}</div>
        <ReactQuill theme="snow" value={body} onChange={setBody} />
        <button disabled={!name || !body} onClick={() => create.mutate()} className="btn-primary mt-3 disabled:opacity-50">Créer le modèle</button>
      </div>
    </div>
  )
}
export default TemplatesManager
