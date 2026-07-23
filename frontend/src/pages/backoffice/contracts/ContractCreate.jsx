import { useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { contractService } from '../../../services/contractService'
import api from '../../../services/api'

function ContractCreate() {
  const navigate = useNavigate()
  const { data: tplData } = useQuery('contract-templates', () => contractService.listTemplates())
  const { data: propsData } = useQuery('bo-properties-min', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [clientId, setClientId] = useState('')

  const create = useMutation(() => contractService.create({
    template_id: Number(templateId), title: title || undefined,
    property_id: propertyId ? Number(propertyId) : undefined,
    client_id: clientId ? Number(clientId) : undefined,
  }), {
    onSuccess: (res) => navigate(`/backoffice/contrats/${res.contract.id}`),
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const templates = tplData?.templates || []
  const properties = propsData?.properties || []
  const clients = clientsData?.clients || []

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Nouveau contrat</h1>
      <div className="space-y-4 bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm">Modèle
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            <option value="">Choisir un modèle…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_global ? '' : ' (custom)'}</option>)}
          </select>
        </label>
        <label className="block text-sm">Titre (optionnel)
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />
        </label>
        <label className="block text-sm">Bien (optionnel)
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            <option value="">—</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title || p.reference}</option>)}
          </select>
        </label>
        <label className="block text-sm">Client (optionnel)
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
        </label>
        <button disabled={!templateId} onClick={() => create.mutate()} className="btn-primary disabled:opacity-50">Créer</button>
      </div>
    </div>
  )
}
export default ContractCreate
