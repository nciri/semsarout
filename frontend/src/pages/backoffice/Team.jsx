import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  FiPlus, FiSearch, FiUser, FiMail, FiPhone, FiShield,
  FiEdit2, FiTrash2, FiCheck, FiX, FiChevronDown, FiChevronRight,
  FiUserCheck, FiUsers, FiDollarSign, FiTrendingUp, FiEye
} from 'react-icons/fi'
import api from '../../services/api'

const backofficeService = {
  getUsers: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/users?${searchParams}`)
    return data
  },
  getRoles: async () => {
    const { data } = await api.get('/backoffice/roles')
    return data
  },
  updateUser: async ({ id, data }) => {
    const { data: response } = await api.put(`/backoffice/users/${id}`, data)
    return response
  },
  inviteUser: async (data) => {
    const { data: response } = await api.post('/backoffice/users/invite', data)
    return response
  }
}

const ROLE_CONFIG = {
  admin: {
    label: 'Administrateurs',
    icon: FiShield,
    color: 'bg-red-500',
    lightColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    description: 'Accès complet à toutes les fonctionnalités'
  },
  manager: {
    label: 'Managers',
    icon: FiUserCheck,
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    description: 'Gestion de l\'équipe et supervision'
  },
  agent: {
    label: 'Agents',
    icon: FiUsers,
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    description: 'Agents immobiliers'
  },
  marketing: {
    label: 'Marketing',
    icon: FiTrendingUp,
    color: 'bg-green-500',
    lightColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    description: 'Équipe marketing et communication'
  },
  accountant: {
    label: 'Comptables',
    icon: FiDollarSign,
    color: 'bg-yellow-500',
    lightColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
    description: 'Gestion financière et facturation'
  },
  readonly: {
    label: 'Lecture seule',
    icon: FiEye,
    color: 'bg-gray-500',
    lightColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
    description: 'Accès en consultation uniquement'
  }
}

function InviteModal({ onClose, onInvite, roles }) {
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role_id: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onInvite(formData)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Inviter un membre</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
            <select
              required
              value={formData.role_id}
              onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Sélectionner un rôle</option>
              {roles?.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Envoyer l'invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UserCard({ user, roles, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [selectedRole, setSelectedRole] = useState(user.roles?.[0]?.id || '')

  const handleSaveRole = () => {
    onUpdate(user.id, { role_ids: [selectedRole] })
    setEditing(false)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary-600">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-900">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(!editing)}
            className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50"
          >
            <FiEdit2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {roles?.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <button
              onClick={handleSaveRole}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
            >
              <FiCheck className="w-5 h-5" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <span className={`text-xs font-medium ${user.is_active ? 'text-green-600' : 'text-gray-400'}`}>
            {user.is_active ? 'Actif' : 'Inactif'}
          </span>
        )}
      </div>

      {user.phone && (
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
          <FiPhone className="w-3.5 h-3.5" />
          {user.phone}
        </div>
      )}

      <div className="mt-2 text-xs text-gray-400">
        Membre depuis {new Date(user.created_at).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
      </div>
    </div>
  )
}

function RoleSection({ role, users, roles, onUpdate, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.agent
  const Icon = config.icon

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
                {users.length}
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
          {users.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map(user => (
                <UserCard
                  key={user.id}
                  user={user}
                  roles={roles}
                  onUpdate={onUpdate}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Icon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>Aucun membre dans ce rôle</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BackofficeTeam() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)

  const { data: usersData, isLoading } = useQuery(
    ['backoffice-users', search],
    () => backofficeService.getUsers({ q: search }),
    { keepPreviousData: true }
  )

  const { data: rolesData } = useQuery('backoffice-roles', backofficeService.getRoles)

  const updateMutation = useMutation(
    ({ id, data }) => backofficeService.updateUser({ id, data }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('backoffice-users')
      }
    }
  )

  const inviteMutation = useMutation(backofficeService.inviteUser, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-users')
    }
  })

  // Group users by role
  const usersByRole = useMemo(() => {
    const users = usersData?.users || []
    const grouped = {
      admin: [],
      manager: [],
      agent: [],
      marketing: [],
      accountant: [],
      readonly: []
    }

    users.forEach(user => {
      const roleSlug = user.roles?.[0]?.slug || 'agent'
      if (grouped[roleSlug]) {
        grouped[roleSlug].push(user)
      } else {
        grouped.agent.push(user) // Default fallback
      }
    })

    return grouped
  }, [usersData?.users])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Équipe</h1>
          <p className="text-gray-500">Gérez les membres de votre équipe et leurs rôles</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <FiPlus className="w-5 h-5" />
          Inviter un membre
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(ROLE_CONFIG).map(([role, config]) => {
          const Icon = config.icon
          const count = usersByRole[role]?.length || 0
          return (
            <div
              key={role}
              className={`${config.lightColor} rounded-xl p-4 border ${config.borderColor}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className={`text-xs ${config.textColor}`}>{config.label}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Users grouped by role */}
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
      ) : usersData?.users?.length > 0 ? (
        <div className="space-y-4">
          {Object.keys(ROLE_CONFIG).map(role => (
            <RoleSection
              key={role}
              role={role}
              users={usersByRole[role] || []}
              roles={rolesData?.roles}
              onUpdate={(id, data) => updateMutation.mutate({ id, data })}
              defaultExpanded={usersByRole[role]?.length > 0}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FiUser className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun membre trouvé</h3>
          <p className="text-gray-500 mb-4">
            {search ? 'Aucun membre ne correspond à votre recherche.' : 'Invitez votre premier membre.'}
          </p>
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-5 h-5" />
            Inviter un membre
          </button>
        </div>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onInvite={(data) => inviteMutation.mutate(data)}
          roles={rolesData?.roles}
        />
      )}
    </div>
  )
}
