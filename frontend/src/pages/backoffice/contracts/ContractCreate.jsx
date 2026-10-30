import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiFileText } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import PartiesField from './PartiesField'
import { emptyParty, toPayload } from './parties'
import api from '../../../services/api'
import RichTextarea from '../../../components/common/RichTextarea'
import { isRichTextEmpty } from '../../../utils/richText'

// Les modèles sont du HTML : on n'en montre qu'une projection texte, jamais injectée en innerHTML.
const ENTITIES = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' }
const htmlToText = (html) => (html || '')
  .replace(/<\s*br\s*\/?>|<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
  .replace(/<[^>]*>/g, '')
  .replace(/&(nbsp|lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m])
  .replace(/\n\s*\n+/g, '\n\n')
  .trim()

function ContractCreate() {
  const { t } = useTranslation(['backoffice', 'common'])
  const navigate = useNavigate()
  const { data: tplData } = useQuery('contract-templates', () => contractService.listTemplates())
  const { data: propsData } = useQuery('bo-properties-min', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  // Un contrat peut nommer plusieurs vendeurs ou plusieurs locataires : la liste des parties
  // remplace le client unique, dont le rôle est désormais tenu par la première d'entre elles.
  const [form, setForm] = useState({
    template_id: '', title: '', property_id: '', parties: [emptyParty()], transaction_id: '',
    amount: '', sign_date: '', effect_date: '', notes: '',
  })
  const parties = form.parties
  const primaryClient = parties.find((p) => p.client_id)?.client_id || ''
  const { data: txData } = useQuery(
    ['bo-transactions-min', form.property_id, form.property_id ? '' : primaryClient],
    // Sans bien, le client filtre côté serveur : sa transaction ne peut pas tomber hors de la première page.
    async () => (await api.get('/backoffice/transactions', {
      params: { per_page: 100, property_id: form.property_id || undefined, client_id: form.property_id ? undefined : (primaryClient || undefined) },
    })).data,
  )
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const templates = tplData?.templates || []
  const properties = propsData?.properties || []
  const propertyTx = txData?.transactions || []
  // Un bien sans transaction ne doit pas vider les deux listes : on retombe sur tous les clients.
  const noTransaction = Boolean(form.property_id && txData && propertyTx.length === 0)
  const cascaded = Boolean(form.property_id && propertyTx.length > 0)
  const clientName = (id) => {
    const c = (clientsData?.clients || []).find((x) => String(x.id) === String(id))
    return c ? `${c.first_name} ${c.last_name}` : `#${id}`
  }
  const clientOptions = cascaded
    ? [...new Map(propertyTx.filter((tx) => tx.client_id).map((tx) => [tx.client_id, { value: tx.client_id, label: tx.client_name || clientName(tx.client_id) }])).values()]
    : (clientsData?.clients || []).map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))
  const transactions = primaryClient ? propertyTx.filter((tx) => String(tx.client_id) === String(primaryClient)) : propertyTx
  const setParties = (next) => setForm((f) => ({ ...f, parties: next }))

  // Une fois les transactions du bien connues, on écarte transaction et parties qui n'en font plus partie.
  useEffect(() => {
    if (!form.property_id || !txData) return
    const txs = txData.transactions || []
    const txOk = !form.transaction_id || txs.some((tx) => String(tx.id) === String(form.transaction_id))
    const clientOk = (id) => !id || txs.length === 0 || txs.some((tx) => String(tx.client_id) === String(id))
    if (!txOk || !form.parties.every((p) => clientOk(p.client_id))) {
      setForm((f) => ({
        ...f,
        transaction_id: txOk ? f.transaction_id : '',
        // Le rôle choisi reste : seul le client qui ne relève plus du bien est vidé.
        parties: f.parties.map((p) => (clientOk(p.client_id) ? p : { ...p, client_id: '' })),
      }))
    }
  }, [txData, form.property_id, form.transaction_id, form.parties])

  // La première partie tient le rôle de l'ancien client unique : c'est elle que la cascade
  // renseigne depuis une transaction, et elle que le backend recopie dans `client_id`.
  const setPrimaryClient = (f, id) => {
    const parts = f.parties.length ? f.parties : [emptyParty()]
    const i = Math.max(0, parts.findIndex((p) => p.client_id))
    return parts.map((p, j) => (j === i ? { ...p, client_id: id } : p))
  }
  const pickProperty = (id) => setForm((f) => ({ ...f, property_id: id, transaction_id: id ? f.transaction_id : '' }))
  const pickTransaction = (id) => setForm((f) => {
    const tx = propertyTx.find((x) => String(x.id) === String(id))
    return {
      ...f, transaction_id: id, property_id: tx?.property_id ?? f.property_id,
      parties: tx ? setPrimaryClient(f, tx.client_id ?? '') : f.parties,
    }
  })
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
    parties: toPayload(parties),
    transaction_id: form.transaction_id ? Number(form.transaction_id) : undefined,
    amount: form.amount ? Number(form.amount) : undefined,
    sign_date: form.sign_date || undefined,
    effect_date: form.effect_date || undefined,
    // Le champ est en texte riche : un éditeur vidé rend `<p><br></p>`, du HTML valide mais
    // sans contenu, que le service prendrait pour une note renseignée.
    notes: isRichTextEmpty(form.notes) ? undefined : form.notes,
  }), {
    onSuccess: (res) => navigate(`/backoffice/contrats/${res.contract.id}`),
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  const labelCls = 'block text-[12.5px] font-medium text-gray-700 mb-0.5'
  const ctrlCls = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const cardCls = 'bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3'
  const sectionTitle = 'text-[13px] font-semibold text-gray-900'

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('backoffice:contracts.create.fields.property')}</label>
                <SearchableSelect
                  value={form.property_id}
                  onChange={pickProperty}
                  options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))}
                  placeholder={t('backoffice:contracts.create.select.none')}
                  searchPlaceholder={t('backoffice:contracts.create.search.property')}
                  className="text-sm"
                  clearable
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>{t('backoffice:contracts.create.fields.transaction')}</label>
                <SearchableSelect
                  value={form.transaction_id}
                  onChange={pickTransaction}
                  options={transactions.map((tx) => ({ value: tx.id, label: `${tx.reference} · ${tx.property_title || t('backoffice:contracts.create.fallback.property')}`, description: tx.client_name }))}
                  placeholder={t('backoffice:contracts.create.select.noneTransaction')}
                  searchPlaceholder={t('backoffice:contracts.create.search.transaction')}
                  className="text-sm"
                  clearable
                />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <h2 className={sectionTitle}>{t('backoffice:contracts.parties.section')}</h2>
            <PartiesField
              parties={parties}
              onChange={setParties}
              clientOptions={clientOptions}
              hint={noTransaction
                ? t('backoffice:contracts.create.select.allClientsHint')
                : t('backoffice:contracts.parties.hint')}
            />
            <p className="text-xs text-gray-400">{t('backoffice:contracts.parties.identityHint')}</p>
          </div>

          <div className={cardCls}>
            <h2 className={sectionTitle}>{t('backoffice:contracts.create.sections.details')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <label htmlFor="contract-notes" className={labelCls}>{t('backoffice:contracts.create.fields.notes')}</label>
              <RichTextarea id="contract-notes" rows={2} value={form.notes}
                onChange={(html) => setForm((f) => ({ ...f, notes: html }))}
                placeholder={t('backoffice:contracts.create.fields.notesPlaceholder')} />
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
                {htmlToText(selectedTpl.body_html) || t('backoffice:contracts.create.preview.noContent')}
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
