import { useMemo, useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiFileText } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'

function ContractCreate() {
  const { t } = useTranslation(['backoffice', 'common'])
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
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const cardCls = 'bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4'
  const sectionTitle = 'text-sm font-semibold text-gray-900'

  return (
    <div className="space-y-4">
      <Link to="/backoffice/contrats" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> {t('backoffice:contracts.shared.backToList')}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">{t('backoffice:contracts.create.pageTitle')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Formulaire */}
        <div className="lg:col-span-3 space-y-4">
          <div className={cardCls}>
            <h2 className={sectionTitle}>{t('backoffice:contracts.create.sections.template')}</h2>
            <div>
              <label className={labelCls}>{t('backoffice:contracts.create.fields.template')} <span className="text-red-500">*</span></label>
              <select value={form.template_id} onChange={set('template_id')} className={ctrlCls}>
                <option value="">{t('backoffice:contracts.create.fields.templatePlaceholder')}</option>
                {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}{tpl.is_global ? '' : t('backoffice:contracts.create.fields.customSuffix')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('backoffice:contracts.create.fields.title')}</label>
              <input value={form.title} onChange={set('title')} className={ctrlCls} placeholder={t('backoffice:contracts.create.fields.titlePlaceholder')} />
            </div>
          </div>

          <div className={cardCls}>
            <h2 className={sectionTitle}>{t('backoffice:contracts.create.sections.attach')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.property')}</label>
                <SearchableSelect
                  value={form.property_id}
                  onChange={setVal('property_id')}
                  options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))}
                  placeholder={t('backoffice:contracts.create.select.none')}
                  searchPlaceholder={t('backoffice:contracts.create.search.property')}
                  clearable
                />
              </div>
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.client')}</label>
                <SearchableSelect
                  value={form.client_id}
                  onChange={setVal('client_id')}
                  options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))}
                  placeholder={t('backoffice:contracts.create.select.none')}
                  searchPlaceholder={t('backoffice:contracts.create.search.client')}
                  clearable
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>{t('backoffice:contracts.create.fields.transaction')}</label>
                <SearchableSelect
                  value={form.transaction_id}
                  onChange={setVal('transaction_id')}
                  options={transactions.map((tx) => ({ value: tx.id, label: `${tx.reference} · ${tx.property_title || t('backoffice:contracts.create.fallback.property')}`, description: tx.client_name }))}
                  placeholder={t('backoffice:contracts.create.select.noneTransaction')}
                  searchPlaceholder={t('backoffice:contracts.create.search.transaction')}
                  clearable
                />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <h2 className={sectionTitle}>{t('backoffice:contracts.create.sections.details')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.seller')}</label>
                <input value={form.seller_name} onChange={set('seller_name')} className={ctrlCls} placeholder={t('backoffice:contracts.create.fields.sellerPlaceholder')} />
              </div>
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.buyer')}</label>
                <input value={form.buyer_name} onChange={set('buyer_name')} className={ctrlCls} placeholder={t('backoffice:contracts.create.fields.buyerPlaceholder')} />
              </div>
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.amount')}</label>
                <input type="number" min="0" value={form.amount} onChange={set('amount')} className={ctrlCls} placeholder={t('backoffice:contracts.create.fields.amountPlaceholder')} />
              </div>
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.signDate')}</label>
                <input type="date" value={form.sign_date} onChange={set('sign_date')} className={ctrlCls} />
              </div>
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.effectDate')}</label>
                <input type="date" value={form.effect_date} onChange={set('effect_date')} className={ctrlCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('backoffice:contracts.create.fields.notes')}</label>
              <textarea value={form.notes} onChange={set('notes')} rows={3} className={ctrlCls} placeholder={t('backoffice:contracts.create.fields.notesPlaceholder')} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{t('backoffice:contracts.create.hint')}</p>
            <button
              disabled={!form.template_id || create.isLoading}
              onClick={() => create.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {create.isLoading ? t('backoffice:contracts.create.submitting') : t('backoffice:contracts.create.submit')}
            </button>
          </div>
        </div>

        {/* Aperçu du modèle */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 lg:sticky lg:top-4">
            <div className="flex items-center gap-2 mb-3 text-gray-900">
              <FiFileText className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold">{t('backoffice:contracts.create.preview.title')}</h3>
            </div>
            {selectedTpl ? (
              <div className="max-h-[60vh] overflow-y-auto text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border border-gray-100 rounded-lg p-3 bg-gray-50">
                {selectedTpl.body || t('backoffice:contracts.create.preview.noContent')}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{t('backoffice:contracts.create.preview.empty')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
export default ContractCreate
