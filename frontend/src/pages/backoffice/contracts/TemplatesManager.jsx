import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiTrash2, FiPlus, FiLayout } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import { PageHeader, EmptyState } from '../../../components/backoffice/ui'

const TYPE_VALUES = ['mandate_sale', 'mandate_rental', 'compromise', 'lease', 'other']
const FIELDS = ['agency_name', 'agent_name', 'client_name', 'property_address', 'property_price',
  'property_surface', 'commission_rate', 'date']

function TemplatesManager() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data } = useQuery('contract-templates', () => contractService.listTemplates())
  const canManage = data?.can_manage_templates
  const [name, setName] = useState('')
  const [docType, setDocType] = useState('other')
  const [body, setBody] = useState('')

  const create = useMutation(() => contractService.createTemplate({ name, document_type: docType, body_html: body }), {
    onSuccess: () => { toast.success(t('backoffice:contracts.templates.toasts.created')); setName(''); setBody(''); qc.invalidateQueries('contract-templates') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const del = useMutation((id) => contractService.deleteTemplate(id), {
    onSuccess: () => { toast.success(t('backoffice:contracts.templates.toasts.deleted')); qc.invalidateQueries('contract-templates') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (data && !canManage) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center max-w-lg mx-auto">
        <FiLayout className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">{t('backoffice:contracts.templates.gated.title')}</h1>
        <p className="text-gray-500 mt-2 mb-5">{t('backoffice:contracts.templates.gated.message')}</p>
        <Link to="/dashboard/compte/abonnement" className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">{t('backoffice:contracts.templates.gated.cta')}</Link>
      </div>
    )
  }
  const custom = (data?.templates || []).filter((t) => !t.is_global)
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-4">
      <Link to="/backoffice/contrats" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <FiArrowLeft className="w-4 h-4" /> {t('backoffice:contracts.shared.backToList')}
      </Link>
      <PageHeader title={t('backoffice:contracts.templates.pageTitle')} subtitle={t('backoffice:contracts.templates.subtitle')} />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">{t('backoffice:contracts.templates.myTemplates')}</h2></div>
          {custom.length === 0 ? (
            <EmptyState icon={FiLayout} title={t('backoffice:contracts.templates.empty.title')} description={t('backoffice:contracts.templates.empty.description')} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {custom.map((tpl) => (
                <li key={tpl.id} className="flex justify-between items-center px-5 py-3">
                  <span className="text-gray-900">{tpl.name} <span className="text-xs text-gray-400">· {t(`backoffice:contracts.docType.${tpl.document_type}`, { defaultValue: tpl.document_type })}</span></span>
                  <button onClick={() => del.mutate(tpl.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title={t('backoffice:contracts.templates.delete')}>
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">{t('backoffice:contracts.templates.newTemplate')}</h2>
          <div className="mb-3">
            <label className={labelCls}>{t('backoffice:contracts.templates.fields.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('backoffice:contracts.templates.fields.namePlaceholder')} className={ctrlCls} />
          </div>
          <div className="mb-3">
            <label className={labelCls}>{t('backoffice:contracts.templates.fields.type')}</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className={ctrlCls}>
              {TYPE_VALUES.map((v) => <option key={v} value={v}>{t(`backoffice:contracts.docType.${v}`)}</option>)}
            </select>
          </div>
          <div className="mb-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
            <span className="font-medium text-gray-600">{t('backoffice:contracts.templates.mergeFields')}</span> {FIELDS.map((f) => `{{${f}}}`).join(' · ')}
          </div>
          <ReactQuill theme="snow" value={body} onChange={setBody} />
          <button
            disabled={!name || !body || create.isLoading}
            onClick={() => create.mutate()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <FiPlus className="w-5 h-5" /> {t('backoffice:contracts.templates.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
export default TemplatesManager
