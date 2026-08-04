import { useMemo, useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiFileText } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'

function ContractCreate() {
  const navigate = useNavigate()
  const { data: tplData } = useQuery('contract-templates', () => contractService.listTemplates())
  const { data: propsData } = useQuery('bo-properties-min', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const { data: txData } = useQuery('bo-transactions-min', async () => (await api.get('/backoffice/transactions?per_page=100')).data)

  const [form, setForm] = useState({
    template_id: '', title: '', property_id: '', client_id: '', transaction_id: '',
    seller_name: '', buyer_name: '', amount: '', sign_date: '', effect_date: '', notes: '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const templates = tplData?.templates || []
  const properties = propsData?.properties || []
  const clients = clientsData?.clients || []
  const transactions = txData?.transactions || []
  const selectedTpl = useMemo(
    () => templates.find((t) => String(t.id) === String(form.template_id)),
    [templates, form.template_id],
  )

  // Les champs de rattachement/contexte sont transmis au contrat ; ceux que le backend
  // ne persiste pas encore restent sans effet côté données (édition fine dans l'éditeur).
  const create = useMutation(() => contractService.create({
    template_id: Number(form.template_id),
    title: form.title || undefined,
    property_id: form.property_id ? Number(form.property_id) : undefined,
    client_id: form.client_id ? Number(form.client_id) : undefined,
    transaction_id: form.transaction_id ? Number(form.transaction_id) : undefined,
    seller_name: form.seller_name || undefined,
    buyer_name: form.buyer_name || undefined,
    amount: form.amount ? Number(form.amount) : undefined,
    sign_date: form.sign_date || undefined,
    effect_date: form.effect_date || undefined,
    notes: form.notes || undefined,
  }), {
    onSuccess: (res) => navigate(`/backoffice/contrats/${res.contract.id}`),
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const cardCls = 'bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4'
  const sectionTitle = 'text-sm font-semibold text-gray-900'

  return (
    <div className="space-y-4">
      <Link to="/backoffice/contrats" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Contrats
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Nouveau contrat</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Formulaire */}
        <div className="lg:col-span-3 space-y-4">
          <div className={cardCls}>
            <h2 className={sectionTitle}>Modèle</h2>
            <div>
              <label className={labelCls}>Modèle <span className="text-red-500">*</span></label>
              <select value={form.template_id} onChange={set('template_id')} className={ctrlCls}>
                <option value="">Choisir un modèle…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_global ? '' : ' (personnalisé)'}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Titre du contrat</label>
              <input value={form.title} onChange={set('title')} className={ctrlCls} placeholder="Ex. Mandat de vente — Villa Anfa" />
            </div>
          </div>

          <div className={cardCls}>
            <h2 className={sectionTitle}>Rattachement</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Bien</label>
                <SearchableSelect
                  value={form.property_id}
                  onChange={setVal('property_id')}
                  options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))}
                  placeholder="—"
                  searchPlaceholder="Rechercher un bien…"
                  clearable
                />
              </div>
              <div>
                <label className={labelCls}>Client</label>
                <SearchableSelect
                  value={form.client_id}
                  onChange={setVal('client_id')}
                  options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))}
                  placeholder="—"
                  searchPlaceholder="Rechercher un client…"
                  clearable
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Transaction liée</label>
                <SearchableSelect
                  value={form.transaction_id}
                  onChange={setVal('transaction_id')}
                  options={transactions.map((t) => ({ value: t.id, label: `${t.reference} · ${t.property_title || 'Bien'}`, description: t.client_name }))}
                  placeholder="— Aucune"
                  searchPlaceholder="Rechercher une transaction…"
                  clearable
                />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <h2 className={sectionTitle}>Détails du contrat</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Vendeur / Mandant</label>
                <input value={form.seller_name} onChange={set('seller_name')} className={ctrlCls} placeholder="Nom du vendeur" />
              </div>
              <div>
                <label className={labelCls}>Acheteur / Locataire</label>
                <input value={form.buyer_name} onChange={set('buyer_name')} className={ctrlCls} placeholder="Nom de l'acheteur" />
              </div>
              <div>
                <label className={labelCls}>Montant (Đh)</label>
                <input type="number" min="0" value={form.amount} onChange={set('amount')} className={ctrlCls} placeholder="Ex. 1500000" />
              </div>
              <div>
                <label className={labelCls}>Date de signature</label>
                <input type="date" value={form.sign_date} onChange={set('sign_date')} className={ctrlCls} />
              </div>
              <div>
                <label className={labelCls}>Prise d'effet</label>
                <input type="date" value={form.effect_date} onChange={set('effect_date')} className={ctrlCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notes / clauses particulières</label>
              <textarea value={form.notes} onChange={set('notes')} rows={3} className={ctrlCls} placeholder="Conditions suspensives, clauses spécifiques…" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">Le contenu détaillé se peaufine ensuite dans l'éditeur de contrat.</p>
            <button
              disabled={!form.template_id || create.isLoading}
              onClick={() => create.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {create.isLoading ? 'Création…' : 'Créer le contrat'}
            </button>
          </div>
        </div>

        {/* Aperçu du modèle */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 lg:sticky lg:top-4">
            <div className="flex items-center gap-2 mb-3 text-gray-900">
              <FiFileText className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold">Aperçu du modèle</h3>
            </div>
            {selectedTpl ? (
              <div className="max-h-[60vh] overflow-y-auto text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border border-gray-100 rounded-lg p-3 bg-gray-50">
                {selectedTpl.body || 'Ce modèle n\'a pas de contenu de prévisualisation.'}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sélectionnez un modèle pour afficher son aperçu.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
export default ContractCreate
