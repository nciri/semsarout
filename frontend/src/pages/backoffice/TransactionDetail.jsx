import { useQuery } from 'react-query'
import { useParams, Link } from 'react-router-dom'
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
const STATUS_LABELS = { active: 'En cours', won: 'Gagnée', lost: 'Perdue', on_hold: 'En pause' }
const TYPE_LABELS = { sale: 'Vente', rent: 'Location' }
const PRIORITY_LABELS = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgent' }
const STAGE_LABELS = {
  contact: 'Contact initial', visit: 'Visite', offer: 'Offre', negotiation: 'Négociation',
  compromise: 'Compromis', final_act: 'Acte final', application: 'Candidature',
  verification: 'Vérification', lease: 'Bail', move_in: 'Entrée',
}
const OFFER_STATUS = {
  pending: 'En attente', accepted: 'Acceptée', rejected: 'Refusée',
  countered: 'Contre-offre', expired: 'Expirée',
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
        <p className="text-gray-500 mb-4">Transaction introuvable.</p>
        <Link to="/backoffice/transactions" className="text-primary-600 hover:text-primary-700">
          Retour à la liste
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
              <span className="text-sm text-gray-500">{TYPE_LABELS[tx.transaction_type] || tx.transaction_type}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[tx.status] || STATUS_BADGE.active}`}>
                {STATUS_LABELS[tx.status] || tx.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/backoffice/pipeline" className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm">
            Voir le pipeline
          </Link>
        </div>
      </div>

      {/* Bien & parties */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Bien &amp; parties</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field icon={FiHome} label="Bien">
            {tx.property_id ? (
              <Link to={`/backoffice/biens/${tx.property_id}`} className="hover:text-primary-600">
                {tx.property_title || `Bien #${tx.property_id}`}
                {tx.property_city ? ` · ${tx.property_city}` : ''}
              </Link>
            ) : null}
          </Field>
          <Field icon={FiUser} label="Client">
            {tx.client_id ? (
              <Link to={`/backoffice/clients/${tx.client_id}`} className="hover:text-primary-600">
                {tx.client_name || `Client #${tx.client_id}`}
              </Link>
            ) : tx.client_name}
          </Field>
          <Field icon={FiUser} label="Vendeur / Mandant">
            {tx.seller_id ? (
              <Link to={`/backoffice/clients/${tx.seller_id}`} className="hover:text-primary-600">
                {tx.seller_name || `Client #${tx.seller_id}`}
              </Link>
            ) : tx.seller_name}
          </Field>
          <Field icon={FiUser} label="Agent">{tx.agent_name}</Field>
        </div>
      </div>

      {/* Suivi commercial */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FiTrendingUp className="w-5 h-5 text-gray-400" /> Suivi commercial
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field icon={FiTag} label="Étape">{STAGE_LABELS[tx.stage] || tx.stage}</Field>
          <Field icon={FiTag} label="Priorité">{PRIORITY_LABELS[tx.priority] || tx.priority}</Field>
          <Field icon={FiTrendingUp} label="Probabilité">{tx.probability != null ? `${tx.probability} %` : '—'}</Field>
          <Field icon={FiCalendar} label="Premier contact">{fmtDate(tx.contact_date)}</Field>
          <Field icon={FiCalendar} label="Clôture prévue">{fmtDate(tx.expected_closing_date)}</Field>
          <Field icon={FiCalendar} label="Clôture réelle">{fmtDate(tx.closing_date)}</Field>
        </div>
        {tx.status === 'lost' && tx.lost_reason && (
          <p className="mt-4 text-sm text-red-600">Motif de perte : {tx.lost_reason}</p>
        )}
      </div>

      {/* Financier */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FiDollarSign className="w-5 h-5 text-gray-400" /> Financier
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Prix demandé">{tx.asking_price != null ? formatPrice(tx.asking_price) : '—'}</Field>
          <Field label="Prix d'offre">{tx.offer_price != null ? formatPrice(tx.offer_price) : '—'}</Field>
          <Field label="Prix final">{tx.final_price != null ? formatPrice(tx.final_price) : '—'}</Field>
          <Field label="Taux de commission">{tx.commission_rate != null ? `${tx.commission_rate} %` : '—'}</Field>
          <Field label="Montant commission">{tx.commission_amount != null ? formatPrice(tx.commission_amount) : '—'}</Field>
        </div>
      </div>

      {/* Offres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Offres ({offers.length})</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune offre enregistrée.</p>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{formatPrice(o.amount)}</p>
                  <p className="text-xs text-gray-500">
                    {o.from_party === 'buyer' ? 'Acheteur' : o.from_party === 'seller' ? 'Vendeur' : o.from_party || '—'}
                    {o.created_by_name ? ` · ${o.created_by_name}` : ''} · {fmtDate(o.created_at)}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-700">
                  {OFFER_STATUS[o.status] || o.status}
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
            <FiFileText className="w-5 h-5 text-gray-400" /> Notes
          </h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{tx.notes}</p>
        </div>
      )}
    </div>
  )
}
