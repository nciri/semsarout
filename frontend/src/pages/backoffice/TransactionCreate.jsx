import { useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft } from 'react-icons/fi'
import SearchableSelect from '../../components/common/SearchableSelect'
import api from '../../services/api'

const PRIORITIES = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
]

// Formulaire de création d'une TRANSACTION (≠ bien). Une transaction relie un bien
// existant à un client et suit son avancement. POST /backoffice/transactions.
function TransactionCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: propsData } = useQuery('bo-properties-min', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  // Pré-remplissage depuis une fiche client (client_id + type) ou un bien (property_id).
  const [form, setForm] = useState({
    property_id: searchParams.get('property_id') || '',
    client_id: searchParams.get('client_id') || '',
    transaction_type: searchParams.get('type') === 'rent' ? 'rent' : 'sale',
    asking_price: '', expected_closing_date: '', priority: 'medium', notes: '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const create = useMutation(() => api.post('/backoffice/transactions', {
    property_id: form.property_id ? Number(form.property_id) : undefined,
    client_id: form.client_id ? Number(form.client_id) : undefined,
    transaction_type: form.transaction_type,
    asking_price: form.asking_price ? Number(form.asking_price) : undefined,
    expected_closing_date: form.expected_closing_date || undefined,
    priority: form.priority,
    notes: form.notes || undefined,
  }).then((r) => r.data), {
    onSuccess: (tx) => { toast.success('Transaction créée'); navigate(`/backoffice/transactions/${tx.id}`) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const properties = propsData?.properties || []
  const clients = clientsData?.clients || []
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const canSubmit = form.property_id && form.client_id && !create.isLoading

  return (
    <div className="space-y-4 max-w-2xl">
      <Link to="/backoffice/transactions" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> Transactions
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle transaction</h1>
        <p className="text-gray-500">Reliez un bien existant à un client. Pour créer un nouveau bien, utilisez la page Biens.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Bien &amp; client</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Bien <span className="text-red-500">*</span></label>
              <SearchableSelect
                value={form.property_id}
                onChange={setVal('property_id')}
                options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))}
                placeholder="Choisir un bien…"
                searchPlaceholder="Rechercher un bien…"
              />
            </div>
            <div>
              <label className={labelCls}>Client <span className="text-red-500">*</span></label>
              <SearchableSelect
                value={form.client_id}
                onChange={setVal('client_id')}
                options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))}
                placeholder="Choisir un client…"
                searchPlaceholder="Rechercher un client…"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Détails</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.transaction_type} onChange={set('transaction_type')} className={ctrlCls}>
                <option value="sale">Vente</option>
                <option value="rent">Location</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Prix demandé (Đh)</label>
              <input type="number" min="0" value={form.asking_price} onChange={set('asking_price')} className={ctrlCls} placeholder="Ex. 1500000" />
            </div>
            <div>
              <label className={labelCls}>Clôture prévue</label>
              <input type="date" value={form.expected_closing_date} onChange={set('expected_closing_date')} className={ctrlCls} />
            </div>
            <div>
              <label className={labelCls}>Priorité</label>
              <select value={form.priority} onChange={set('priority')} className={ctrlCls}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} className={ctrlCls} placeholder="Contexte, conditions particulières…" />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Vous serez l'agent assigné. La transaction démarre à l'étape « Contact ».</p>
          <button disabled={!canSubmit} onClick={() => create.mutate()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
            {create.isLoading ? 'Création…' : 'Créer la transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
export default TransactionCreate
