import { useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft } from 'react-icons/fi'
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
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-4 max-w-xl">
      <Link to="/backoffice/contrats" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Contrats
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Nouveau contrat</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div>
          <label className={labelCls}>Modèle</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={ctrlCls}>
            <option value="">Choisir un modèle…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_global ? '' : ' (personnalisé)'}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Titre (optionnel)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={ctrlCls} placeholder="Ex. Mandat de vente — Villa Anfa" />
        </div>
        <div>
          <label className={labelCls}>Bien (optionnel)</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={ctrlCls}>
            <option value="">—</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title || p.reference}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Client (optionnel)</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={ctrlCls}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
        </div>
        <button
          disabled={!templateId || create.isLoading}
          onClick={() => create.mutate()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          Créer le contrat
        </button>
      </div>
    </div>
  )
}
export default ContractCreate
