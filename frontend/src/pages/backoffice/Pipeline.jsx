import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiPlus, FiMoreVertical, FiUser, FiHome, FiDollarSign,
  FiCalendar, FiEdit2, FiTrash2
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import SearchableSelect from '../../components/common/SearchableSelect'
import api from '../../services/api'
import { useFormat } from '../../utils/format'

const backofficeService = {
  getPipeline: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/transactions/pipeline?${searchParams}`)
    return data
  },
  moveTransaction: async ({ id, stage, order }) => {
    const { data } = await api.post(`/backoffice/transactions/${id}/move`, { stage, order })
    return data
  },
  getAgents: async () => {
    try {
      const { data } = await api.get('/backoffice/users?role=agent')
      return data
    } catch (error) {
      return { users: [] }
    }
  }
}

const STAGE_COLORS = {
  gray: 'bg-gray-100 border-gray-300',
  blue: 'bg-blue-100 border-blue-300',
  yellow: 'bg-yellow-100 border-yellow-300',
  orange: 'bg-orange-100 border-orange-300',
  purple: 'bg-purple-100 border-purple-300',
  green: 'bg-green-100 border-green-300'
}

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600'
}

function TransactionCard({ transaction, onDragStart, onDragEnd, t }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { fmtDate } = useFormat()
  const priorityKey = transaction.priority in PRIORITY_COLORS ? transaction.priority : 'medium'

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, transaction)}
      onDragEnd={onDragEnd}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-2 cursor-move hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <Link
          to={`/backoffice/transactions/${transaction.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-mono text-primary-600 hover:text-primary-700 hover:underline"
          title={t('backoffice:crm.pipeline.pipeline.card.openDetail')}
        >
          {transaction.reference}
        </Link>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <FiMoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute end-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
              <Link
                to={`/backoffice/transactions/${transaction.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FiEdit2 className="w-4 h-4" /> {t('backoffice:crm.pipeline.pipeline.card.edit')}
              </Link>
              <button
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
              >
                <FiTrash2 className="w-4 h-4" /> {t('backoffice:crm.pipeline.pipeline.card.archive')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Property info */}
      <div className="mb-2">
        <p className="font-medium text-gray-900 text-sm line-clamp-1">
          {transaction.property_title || t('backoffice:crm.pipeline.pipeline.card.noPropertyTitle')}
        </p>
        {transaction.property_city && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <FiHome className="w-3 h-3" />
            {transaction.property_city}
          </p>
        )}
      </div>

      {/* Client info */}
      <div className="flex items-center gap-2 mb-2 text-xs text-gray-600">
        <FiUser className="w-3 h-3" />
        <span className="truncate">{transaction.client_name || t('backoffice:crm.pipeline.pipeline.card.noClient')}</span>
      </div>

      {/* Price */}
      {transaction.asking_price && (
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-900">
          <FiDollarSign className="w-4 h-4 text-gray-400" />
          {formatPrice(transaction.asking_price)}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[transaction.priority] || PRIORITY_COLORS.medium}`}>
          {t(`backoffice:crm.pipeline.pipeline.priority.${priorityKey}`)}
        </span>
        {transaction.expected_closing_date && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <FiCalendar className="w-3 h-3" />
            {fmtDate(transaction.expected_closing_date, { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Agent */}
      {transaction.agent_name && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">{t('backoffice:crm.pipeline.pipeline.card.agent', { name: transaction.agent_name })}</span>
        </div>
      )}
    </div>
  )
}

function PipelineColumn({ stage, transactions, onDragOver, onDrop, t }) {
  const totalValue = transactions.reduce((sum, tx) => sum + (parseFloat(tx.asking_price) || 0), 0)

  return (
    <div
      className="flex-1 min-w-0"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage.id)}
    >
      <div className={`rounded-t-lg p-3 ${STAGE_COLORS[stage.color] || 'bg-gray-100'} border-b-2`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{stage.name}</h3>
          <span className="px-2 py-0.5 bg-white/50 rounded-full text-sm font-medium">
            {transactions.length}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          {formatPrice(totalValue)}
        </p>
      </div>

      <div className="bg-gray-50 rounded-b-lg p-2 min-h-[400px]">
        {transactions.map(transaction => (
          <TransactionCard
            key={transaction.id}
            transaction={transaction}
            onDragStart={(e, tx) => {
              e.dataTransfer.setData('transaction', JSON.stringify(tx))
            }}
            onDragEnd={() => {}}
            t={t}
          />
        ))}

        {transactions.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            {t('backoffice:crm.pipeline.pipeline.column.empty')}
          </div>
        )}
      </div>
    </div>
  )
}

export default function BackofficePipeline() {
  const { t } = useTranslation(['backoffice', 'common'])
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    type: 'sale',
    agent_id: ''
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery(
    ['backoffice-pipeline', filters],
    () => backofficeService.getPipeline(filters),
    { keepPreviousData: true }
  )

  const { data: agentsData } = useQuery('backoffice-agents', backofficeService.getAgents)

  const moveMutation = useMutation(backofficeService.moveTransaction, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-pipeline')
    }
  })

  const handleDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add('bg-primary-50')
  }

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('bg-primary-50')
  }

  const handleDrop = (e, stageId) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-primary-50')

    const transactionData = e.dataTransfer.getData('transaction')
    if (!transactionData) return

    const transaction = JSON.parse(transactionData)
    if (transaction.stage === stageId) return

    moveMutation.mutate({
      id: transaction.id,
      stage: stageId,
      order: 0
    })
  }

  // Calculate totals
  const totalTransactions = data?.pipeline?.reduce((sum, stage) => sum + stage.transactions.length, 0) || 0
  const totalValue = data?.pipeline?.reduce((sum, stage) =>
    sum + stage.transactions.reduce((s, tx) => s + (parseFloat(tx.asking_price) || 0), 0), 0) || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('backoffice:crm.pipeline.pipeline.list.pageTitle')}</h1>
          <p className="text-gray-500">{t('backoffice:crm.pipeline.pipeline.list.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/backoffice/transactions"
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('backoffice:crm.pipeline.pipeline.list.listViewLink')}
          </Link>
          <Link
            to="/backoffice/transactions/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-5 h-5" />
            {t('backoffice:crm.pipeline.pipeline.list.newButton')}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Transaction type toggle */}
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setFilters({ ...filters, type: 'sale' })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.type === 'sale'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('backoffice:crm.pipeline.pipeline.list.typeSale')}
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'rent' })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.type === 'rent'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('backoffice:crm.pipeline.pipeline.list.typeRent')}
            </button>
          </div>

          {/* Agent filter */}
          <SearchableSelect
            value={filters.agent_id}
            onChange={(v) => setFilters({ ...filters, agent_id: v })}
            options={(agentsData?.users || []).map((agent) => ({ value: agent.id, label: `${agent.first_name} ${agent.last_name}`, description: agent.email }))}
            placeholder={t('backoffice:crm.pipeline.pipeline.list.agentPlaceholder')}
            searchPlaceholder={t('backoffice:crm.pipeline.pipeline.list.agentSearchPlaceholder')}
            clearable
            className="min-w-[12rem]"
          />

          {/* Summary */}
          <div className="ms-auto flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">{t('backoffice:crm.pipeline.pipeline.list.totalTransactions')}</span>
              <span className="ms-2 font-semibold text-gray-900">{totalTransactions}</span>
            </div>
            <div>
              <span className="text-gray-500">{t('backoffice:crm.pipeline.pipeline.list.totalValue')}</span>
              <span className="ms-2 font-semibold text-gray-900">{formatPrice(totalValue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex gap-3 pb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-1 min-w-0">
              <div className="bg-gray-200 rounded-t-lg h-16 animate-pulse"></div>
              <div className="bg-gray-100 rounded-b-lg h-96"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 pb-4">
          {data?.pipeline?.map(stage => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              transactions={stage.transactions}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">{t('backoffice:crm.pipeline.pipeline.list.priorityLegend')}</h3>
        <div className="flex flex-wrap gap-4">
          {Object.keys(PRIORITY_COLORS).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[key]}`}>
                {t(`backoffice:crm.pipeline.pipeline.priority.${key}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
