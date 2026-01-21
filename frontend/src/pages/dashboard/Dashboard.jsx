import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { FiHome, FiUsers, FiEye, FiMessageSquare, FiPlus, FiArrowRight } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
import { propertyService } from '../../services/propertyService'
import api from '../../services/api'

function Dashboard() {
  const { user } = useAuthStore()

  const { data: propertiesData } = useQuery(
    'my-properties-summary',
    () => propertyService.getMyProperties({ per_page: 5 })
  )

  const { data: leadsData } = useQuery(
    'my-leads-summary',
    async () => {
      const response = await api.get('/my-leads', { params: { per_page: 5 } })
      return response.data
    }
  )

  const stats = [
    {
      label: 'Annonces actives',
      value: propertiesData?.total || 0,
      icon: FiHome,
      color: 'bg-primary-100 text-primary-600'
    },
    {
      label: 'Vues totales',
      value: propertiesData?.properties?.reduce((sum, p) => sum + (p.views_count || 0), 0) || 0,
      icon: FiEye,
      color: 'bg-blue-100 text-blue-600'
    },
    {
      label: 'Contacts reçus',
      value: leadsData?.total || 0,
      icon: FiMessageSquare,
      color: 'bg-green-100 text-green-600'
    }
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Bonjour, {user?.first_name} !
          </h1>
          <p className="text-gray-600">
            Bienvenue sur votre tableau de bord
          </p>
        </div>
        <Link to="/dashboard/annonces/nouvelle" className="btn-primary mt-4 md:mt-0">
          <FiPlus className="w-4 h-4 mr-2" />
          Nouvelle annonce
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat, idx) => (
          <div key={idx} className="card p-6">
            <div className="flex items-center">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Properties */}
        <div className="card">
          <div className="p-6 border-b flex justify-between items-center">
            <h2 className="font-semibold">Mes annonces récentes</h2>
            <Link to="/dashboard/annonces" className="text-sm text-primary-600 hover:text-primary-700 flex items-center">
              Voir tout <FiArrowRight className="ml-1" />
            </Link>
          </div>
          <div className="divide-y">
            {propertiesData?.properties?.length > 0 ? (
              propertiesData.properties.slice(0, 5).map(property => (
                <div key={property.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                      <FiHome className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 line-clamp-1">{property.title}</p>
                      <p className="text-sm text-gray-500">{property.city}</p>
                    </div>
                  </div>
                  <span className={`badge ${
                    property.status === 'active' ? 'badge-success' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {property.status === 'active' ? 'Active' : property.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                <p>Aucune annonce</p>
                <Link to="/dashboard/annonces/nouvelle" className="text-primary-600 hover:underline">
                  Créer ma première annonce
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Leads */}
        <div className="card">
          <div className="p-6 border-b flex justify-between items-center">
            <h2 className="font-semibold">Derniers contacts</h2>
            <Link to="/dashboard/leads" className="text-sm text-primary-600 hover:text-primary-700 flex items-center">
              Voir tout <FiArrowRight className="ml-1" />
            </Link>
          </div>
          <div className="divide-y">
            {leadsData?.leads?.length > 0 ? (
              leadsData.leads.slice(0, 5).map(lead => (
                <div key={lead.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-gray-900">{lead.name}</p>
                    <span className={`badge ${
                      lead.status === 'new' ? 'badge-primary' :
                      lead.status === 'contacted' ? 'badge-warning' :
                      lead.status === 'converted' ? 'badge-success' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {lead.status === 'new' ? 'Nouveau' :
                       lead.status === 'contacted' ? 'Contacté' :
                       lead.status === 'converted' ? 'Converti' : lead.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{lead.email}</p>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                <p>Aucun contact reçu</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {user?.user_type === 'professional' && !user?.agency_id && (
        <div className="mt-8 card p-6 bg-gradient-to-r from-primary-50 to-terracotta-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Créez votre espace agence</h3>
              <p className="text-gray-600 text-sm mt-1">
                Bénéficiez de fonctionnalités avancées : gestion d'équipe, API, import CSV...
              </p>
            </div>
            <Link to="/dashboard/agence" className="btn-primary shrink-0">
              Créer mon agence
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
