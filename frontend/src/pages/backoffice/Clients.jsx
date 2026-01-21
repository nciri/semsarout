import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import {
  FiPlus, FiSearch, FiFilter, FiPhone, FiMail,
  FiEdit2, FiTrash2, FiEye, FiUser, FiUsers, FiHome, FiDollarSign,
  FiCalendar, FiChevronDown, FiChevronRight
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'

const backofficeService = {
  getClients: async (params) => {
    const searchParams = new URLSearchParams(params)
    const response = await fetch(`/api/v1/backoffice/clients?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to fetch clients')
    return response.json()
  },
  deleteClient: async (id) => {
    const response = await fetch(`/api/v1/backoffice/clients/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'X-User-Id': localStorage.getItem('userId')
      }
    })
    if (!response.ok) throw new Error('Failed to delete client')
    return response.json()
  }
}

const CLIENT_TYPE_CONFIG = {
  buyer: {
    label: 'Acheteurs',
    icon: FiUser,
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    description: 'Clients à la recherche d\'un bien à acheter'
  },
  seller: {
    label: 'Vendeurs',
    icon: FiHome,
    color: 'bg-green-500',
    lightColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    description: 'Propriétaires souhaitant vendre leur bien'
  },
  landlord: {
    label: 'Propriétaires',
    icon: FiHome,
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    description: 'Propriétaires mettant en location'
  },
  tenant: {
    label: 'Locataires',
    icon: FiUsers,
    color: 'bg-yellow-500',
    lightColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
    description: 'Clients cherchant une location'
  },
  investor: {
    label: 'Investisseurs',
    icon: FiDollarSign,
    color: 'bg-pink-500',
    lightColor: 'bg-pink-50',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-200',
    description: 'Investisseurs immobiliers'
  }
}

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-gray-700'
}

function ClientCard({ client, onDelete }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-primary-600">
              {client.first_name?.[0]}{client.last_name?.[0]}
            </span>
          </div>
          <div>
            <Link
              to={`/backoffice/clients/${client.id}`}
              className="font-medium text-gray-900 hover:text-primary-600"
            >
              {client.first_name} {client.last_name}
            </Link>
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[client.status] || STATUS_BADGE.active}`}>
              {client.status === 'active' ? 'Actif' : client.status === 'prospect' ? 'Prospect' : 'Inactif'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to={`/backoffice/clients/${client.id}`}
            className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50"
          >
            <FiEye className="w-4 h-4" />
          </Link>
          <Link
            to={`/backoffice/clients/${client.id}`}
            className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50"
          >
            <FiEdit2 className="w-4 h-4" />
          </Link>
          <button
            onClick={() => onDelete(client.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {client.email && (
          <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600">
            <FiMail className="w-3.5 h-3.5 text-gray-400" />
            <span className="truncate">{client.email}</span>
          </a>
        )}
        {client.phone && (
          <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600">
            <FiPhone className="w-3.5 h-3.5 text-gray-400" />
            {client.phone}
          </a>
        )}
      </div>

      {(client.budget_min || client.budget_max) && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Budget: {formatPrice(client.budget_min || 0)} - {formatPrice(client.budget_max || 0)}
          </p>
        </div>
      )}
    </div>
  )
}

function ClientTypeSection({ type, clients, onDelete, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const config = CLIENT_TYPE_CONFIG[type]
  const Icon = config?.icon || FiUser

  if (!config) return null

  return (
    <div className={`rounded-xl border ${config.borderColor} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-4 ${config.lightColor} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className={`font-semibold ${config.textColor}`}>
              {config.label}
              <span className="ml-2 px-2 py-0.5 bg-white/50 rounded-full text-sm">
                {clients.length}
              </span>
            </h3>
            <p className="text-sm text-gray-500">{config.description}</p>
          </div>
        </div>
        {expanded ? (
          <FiChevronDown className={`w-5 h-5 ${config.textColor}`} />
        ) : (
          <FiChevronRight className={`w-5 h-5 ${config.textColor}`} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-4 bg-white">
          {clients.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clients.map(client => (
                <ClientCard key={client.id} client={client} onDelete={onDelete} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Icon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>Aucun client dans cette catégorie</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BackofficeClients() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    client_type: '',
    status: '',
    page: 1
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery(
    ['backoffice-clients', filters, search],
    () => backofficeService.getClients({ ...filters, q: search, per_page: 100 }),
    { keepPreviousData: true }
  )

  const deleteMutation = useMutation(backofficeService.deleteClient, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-clients')
    }
  })

  const handleDelete = (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
      deleteMutation.mutate(id)
    }
  }

  // Group clients by type
  const clientsByType = useMemo(() => {
    const clients = data?.clients || []
    const grouped = {
      buyer: [],
      seller: [],
      landlord: [],
      tenant: [],
      investor: []
    }

    clients.forEach(client => {
      const type = client.client_type || 'buyer'
      if (grouped[type]) {
        grouped[type].push(client)
      } else {
        grouped.buyer.push(client) // Default fallback
      }
    })

    return grouped
  }, [data?.clients])

  // Filter types to show based on filter
  const typesToShow = filters.client_type
    ? [filters.client_type]
    : Object.keys(CLIENT_TYPE_CONFIG)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500">Gérez votre base de clients et prospects</p>
        </div>
        <Link
          to="/backoffice/clients/nouveau"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <FiPlus className="w-5 h-5" />
          Nouveau client
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(CLIENT_TYPE_CONFIG).map(([type, config]) => {
          const Icon = config.icon
          const count = clientsByType[type]?.length || 0
          return (
            <div
              key={type}
              className={`${config.lightColor} rounded-xl p-4 border ${config.borderColor}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className={`text-sm ${config.textColor}`}>{config.label}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom, email, téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              showFilters ? 'border-primary-500 text-primary-600 bg-primary-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FiFilter className="w-5 h-5" />
            Filtres
            {(filters.client_type || filters.status) && (
              <span className="px-1.5 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
                {[filters.client_type, filters.status].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de client</label>
              <select
                value={filters.client_type}
                onChange={(e) => setFilters({ ...filters, client_type: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Tous les types</option>
                {Object.entries(CLIENT_TYPE_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Tous les statuts</option>
                <option value="active">Actif</option>
                <option value="prospect">Prospect</option>
                <option value="inactive">Inactif</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ client_type: '', status: '', page: 1 })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clients grouped by type */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gray-200"></div>
                <div className="h-6 bg-gray-200 rounded w-32"></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-32 bg-gray-100 rounded-lg"></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : data?.clients?.length > 0 ? (
        <div className="space-y-4">
          {typesToShow.map(type => (
            <ClientTypeSection
              key={type}
              type={type}
              clients={clientsByType[type] || []}
              onDelete={handleDelete}
              defaultExpanded={!filters.client_type || filters.client_type === type}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FiUsers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun client trouvé</h3>
          <p className="text-gray-500 mb-4">
            {search || filters.client_type || filters.status
              ? 'Aucun client ne correspond à vos critères de recherche.'
              : 'Commencez par ajouter votre premier client.'}
          </p>
          <Link
            to="/backoffice/clients/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-5 h-5" />
            Ajouter un client
          </Link>
        </div>
      )}
    </div>
  )
}
