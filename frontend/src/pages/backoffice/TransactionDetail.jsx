import { useQuery } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiArrowLeft, FiHome, FiUser, FiDollarSign, FiCalendar,
  FiFileText, FiTrendingUp, FiTag
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import api from '../../services/api'

const STATUS_BADGE = {
  active: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
}

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

function Field({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="text-sm text-gray-900 break-words">{children ?? '—'}</div>
      </div>
    </div>
  )
}

export default function BackofficeTransactionDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const { data: tx, isLoading, isError } = useQuery(
    ['bo-transaction', id],
    async () => (await api.get(`/backoffice/transactions/${id}`)).data,
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }
  if (isError || !tx) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <p className="text-gray-500 mb-4">{t('backoffice:crm.transactions.detail.notFound')}</p>
        <Link to="/backoffice/transactions" className="text-primary-600 hover:text-primary-700">
          {t('backoffice:crm.transactions.detail.backToList')}
        </Link>
      </div>
    )
  }

  const offers = tx.offers || []

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/backoffice/transactions" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <FiArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{tx.reference}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">{t(`backoffice:crm.transactions.type.${tx.transaction_type}`, { defaultValue: tx.transaction_type })}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[tx.status] || STATUS_BADGE.active}`}>
                {t(`backoffice:crm.transactions.status.${tx.status}`, { defaultValue: tx.status })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/backoffice/pipeline" className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm">
            {t('backoffice:crm.transactions.detail.pipelineLink')}
          </Link>
        </div>
      </div>

      {/* Bien & parties */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('backoffice:crm.transactions.detail.propertyPartiesTitle')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field icon={FiHome} label={t('backoffice:crm.transactions.detail.propertyLabel')}>
            {tx.property_id ? (
              <Link to={`/backoffice/biens/${tx.property_id}`} className="hover:text-primary-600">
                {tx.property_title || `Bien #${tx.property_id}`}
                {tx.property_city ? ` · ${tx.property_city}` : ''}
              </Link>
            ) : null}
          </Field>
          <Field icon={FiUser} label={t('backoffice:crm.transactions.detail.clientLabel')}>
            {tx.client_id ? (
              <Link to={`/backoffice/clients/${tx.client_id}`} className="hover:text-primary-600">
                {tx.client_name || `Client #${tx.client_id}`}
              </Link>
            ) : tx.client_name}
          </Field>
          <Field icon={FiUser} label={t('backoffice:crm.transactions.detail.sellerLabel')}>
            {tx.seller_id ? (
              <Link to={`/backoffice/clients/${tx.seller_id}`} className="hover:text-primary-600">
                {tx.seller_name || `Client #${tx.seller_id}`}
              </Link>
            ) : tx.seller_name}
          </Field>
          <Field icon={FiUser} label={t('backoffice:crm.transactions.detail.agentLabel')}>{tx.agent_name}</Field>
        </div>
      </div>

      {/* Suivi commercial */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FiTrendingUp className="w-5 h-5 text-gray-400" /> {t('backoffice:crm.transactions.detail.trackingTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field icon={FiTag} label={t('backoffice:crm.transactions.detail.stageLabel')}>{t(`backoffice:crm.transactions.stage.${tx.stage}`, { defaultValue: tx.stage })}</Field>
          <Field icon={FiTag} label={t('backoffice:crm.transactions.detail.priorityLabel')}>{t(`backoffice:crm.pipeline.pipeline.priority.${tx.priority}`, { defaultValue: tx.priority })}</Field>
          <Field icon={FiTrendingUp} label={t('backoffice:crm.transactions.detail.probabilityLabel')}>{tx.probability != null ? `${tx.probability} %` : '—'}</Field>
          <Field icon={FiCalendar} label={t('backoffice:crm.transactions.detail.firstContactLabel')}>{fmtDate(tx.contact_date)}</Field>
          <Field icon={FiCalendar} label={t('backoffice:crm.transactions.detail.expectedClosingLabel')}>{fmtDate(tx.expected_closing_date)}</Field>
          <Field icon={FiCalendar} label={t('backoffice:crm.transactions.detail.actualClosingLabel')}>{fmtDate(tx.closing_date)}</Field>
        </div>
        {tx.status === 'lost' && tx.lost_reason && (
          <p className="mt-4 text-sm text-red-600">{t('backoffice:crm.transactions.detail.lostReason', { reason: tx.lost_reason })}</p>
        )}
      </div>

      {/* Financier */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FiDollarSign className="w-5 h-5 text-gray-400" /> {t('backoffice:crm.transactions.detail.financialTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label={t('backoffice:crm.transactions.detail.askingPriceLabel')}>{tx.asking_price != null ? formatPrice(tx.asking_price) : '—'}</Field>
          <Field label={t('backoffice:crm.transactions.detail.offerPriceLabel')}>{tx.offer_price != null ? formatPrice(tx.offer_price) : '—'}</Field>
          <Field label={t('backoffice:crm.transactions.detail.finalPriceLabel')}>{tx.final_price != null ? formatPrice(tx.final_price) : '—'}</Field>
          <Field label={t('backoffice:crm.transactions.detail.commissionRateLabel')}>{tx.commission_rate != null ? `${tx.commission_rate} %` : '—'}</Field>
          <Field label={t('backoffice:crm.transactions.detail.commissionAmountLabel')}>{tx.commission_amount != null ? formatPrice(tx.commission_amount) : '—'}</Field>
        </div>
      </div>

      {/* Offres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('backoffice:crm.transactions.detail.offersTitle', { count: offers.length })}</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-gray-400">{t('backoffice:crm.transactions.detail.offersEmpty')}</p>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{formatPrice(o.amount)}</p>
                  <p className="text-xs text-gray-500">
                    {o.from_party ? t(`backoffice:crm.transactions.offerParty.${o.from_party}`, { defaultValue: o.from_party }) : '—'}
                    {o.created_by_name ? t('backoffice:crm.transactions.detail.offerCreatedBy', { name: o.created_by_name }) : ''} · {fmtDate(o.created_at)}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-700">
                  {t(`backoffice:crm.transactions.offerStatus.${o.status}`, { defaultValue: o.status })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      {tx.notes && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FiFileText className="w-5 h-5 text-gray-400" /> {t('backoffice:crm.transactions.detail.notesTitle')}
          </h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{tx.notes}</p>
        </div>
      )}
    </div>
  )
}
