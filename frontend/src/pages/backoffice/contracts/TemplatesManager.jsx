import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { FiArrowLeft, FiTrash2, FiPlus, FiLayout } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import { PageHeader, EmptyState } from '../../../components/backoffice/ui'

const TYPES = [['mandate_sale', 'Mandat de vente'], ['mandate_rental', 'Mandat location/gestion'],
  ['compromise', 'Compromis'], ['lease', 'Bail'], ['other', 'Autre']]
const FIELDS = ['agency_name', 'agent_name', 'client_name', 'property_address', 'property_price',
  'property_surface', 'commission_rate', 'date']
const TYPE_LABEL = Object.fromEntries(TYPES)

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
    onSuccess: () => { toast.success('Modèle supprimé'); qc.invalidateQueries('contract-templates') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (data && !canManage) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center max-w-lg mx-auto">
        <FiLayout className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Modèles personnalisés</h1>
        <p className="text-gray-500 mt-2 mb-5">Les modèles personnalisés sont réservés au plan Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">Voir les offres</Link>
      </div>
    )
  }
  const custom = (data?.templates || []).filter((t) => !t.is_global)
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-4">
      <Link to="/backoffice/contrats" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Contrats
      </Link>
      <PageHeader title="Modèles de contrats" subtitle="Créez vos propres trames réutilisables pour générer des contrats" />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Mes modèles personnalisés</h2></div>
          {custom.length === 0 ? (
            <EmptyState icon={FiLayout} title="Aucun modèle personnalisé" description="Créez votre premier modèle depuis le formulaire à droite." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {custom.map((t) => (
                <li key={t.id} className="flex justify-between items-center px-5 py-3">
                  <span className="text-gray-900">{t.name} <span className="text-xs text-gray-400">· {TYPE_LABEL[t.document_type] || t.document_type}</span></span>
                  <button onClick={() => del.mutate(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Supprimer">
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Nouveau modèle</h2>
          <div className="mb-3">
            <label className={labelCls}>Nom du modèle</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Mandat de vente standard" className={ctrlCls} />
          </div>
          <div className="mb-3">
            <label className={labelCls}>Type de document</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className={ctrlCls}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="mb-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
            <span className="font-medium text-gray-600">Champs de fusion :</span> {FIELDS.map((f) => `{{${f}}}`).join(' · ')}
          </div>
          <ReactQuill theme="snow" value={body} onChange={setBody} />
          <button
            disabled={!name || !body || create.isLoading}
            onClick={() => create.mutate()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <FiPlus className="w-5 h-5" /> Créer le modèle
          </button>
        </div>
      </div>
    </div>
  )
}
export default TemplatesManager
