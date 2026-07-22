import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import {
  FiPlus, FiFilter, FiMoreVertical, FiUser, FiHome, FiDollarSign,
  FiCalendar, FiPhone, FiMail, FiEdit2, FiTrash2, FiChevronDown
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import api from '../../services/api'

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

function TransactionCard({ transaction, onDragStart, onDragEnd }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, transaction)}
      onDragEnd={onDragEnd}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-2 cursor-move hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-mono text-gray-500">{transaction.reference}</span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <FiMoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
              <Link
                to={`/backoffice/transactions/${transaction.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FiEdit2 className="w-4 h-4" /> Modifier
              </Link>
              <button
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
              >
                <FiTrash2 className="w-4 h-4" /> Archiver
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Property info */}
      <div className="mb-2">
        <p className="font-medium text-gray-900 text-sm line-clamp-1">
          {transaction.property_title || 'Bien sans titre'}
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
        <span className="truncate">{transaction.client_name || 'Client non défini'}</span>
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
          {transaction.priority === 'urgent' ? 'Urgent' : transaction.priority === 'high' ? 'Haute' : transaction.priority === 'low' ? 'Basse' : 'Moyenne'}
        </span>
        {transaction.expected_closing_date && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <FiCalendar className="w-3 h-3" />
            {new Date(transaction.expected_closing_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Agent */}
      {transaction.agent_name && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">Agent: {transaction.agent_name}</span>
        </div>
      )}
    </div>
  )
}

function PipelineColumn({ stage, transactions, onDragOver, onDrop }) {
  const totalValue = transactions.reduce((sum, t) => sum + (parseFloat(t.asking_price) || 0), 0)

  return (
    <div
      className="flex-shrink-0 w-72"
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
            onDragStart={(e, t) => {
              e.dataTransfer.setData('transaction', JSON.stringify(t))
            }}
            onDragEnd={() => {}}
          />
        ))}

        {transactions.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            Aucune transaction
          </div>
        )}
      </div>
    </div>
  )
}

export default function BackofficePipeline() {
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
    sum + stage.transactions.reduce((s, t) => s + (parseFloat(t.asking_price) || 0), 0), 0) || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-gray-500">Gérez vos transactions en cours</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/backoffice/transactions"
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Vue liste
          </Link>
          <Link
            to="/backoffice/biens/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-5 h-5" />
            Nouvelle transaction
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
              Ventes
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'rent' })}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.type === 'rent'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Locations
            </button>
          </div>

          {/* Agent filter */}
          <select
            value={filters.agent_id}
            onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tous les agents</option>
            {agentsData?.users?.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.first_name} {agent.last_name}
              </option>
            ))}
          </select>

          {/* Summary */}
          <div className="ml-auto flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">Total transactions:</span>
              <span className="ml-2 font-semibold text-gray-900">{totalTransactions}</span>
            </div>
            <div>
              <span className="text-gray-500">Valeur totale:</span>
              <span className="ml-2 font-semibold text-gray-900">{formatPrice(totalValue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-72">
              <div className="bg-gray-200 rounded-t-lg h-16 animate-pulse"></div>
              <div className="bg-gray-100 rounded-b-lg h-96"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 pb-4 -mx-4 px-4 overflow-x-auto" style={{ minWidth: '100%', overflowX: 'scroll' }}>
          {data?.pipeline?.map(stage => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              transactions={stage.transactions}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Légende des priorités</h3>
        <div className="flex flex-wrap gap-4">
          {Object.entries(PRIORITY_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
                {key === 'urgent' ? 'Urgent' : key === 'high' ? 'Haute' : key === 'low' ? 'Basse' : 'Moyenne'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
