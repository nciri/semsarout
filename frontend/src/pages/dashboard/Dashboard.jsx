import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import {
  FiHome, FiUsers, FiEye, FiMessageSquare, FiArrowRight,
  FiExternalLink
} from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
import { propertyService } from '../../services/propertyService'
import api from '../../services/api'
import { STAYMANAGER_REGISTER_URL } from '../../constants/services'
import StayManagerWordmark from '../../components/common/StayManagerWordmark'

/**
 * Parcours d'accueil selon l'intention déclarée à l'inscription (user.interest).
 * Affiché tant que l'utilisateur n'a pas encore d'annonce.
 */
const ONBOARDING = {
  vente: {
    title: 'Prêt à vendre votre bien ?',
    subtitle: 'Constituez votre dossier de vente 100% en ligne en 10 minutes.',
    actions: [
      { label: 'Vendre en ligne', description: 'Descriptif, estimation, photos, documents : tout en un parcours', to: '/vendre', primary: true },
      { label: 'Publier une annonce simple', description: 'Diffusez votre bien gratuitement sur SemsarOut', to: '/dashboard/annonces/nouvelle' },
      { label: 'Estimation gratuite', description: 'Connaissez la valeur de votre bien avant de vendre', to: '/contact?service=estimation' }
    ]
  },
  'mise-en-location': {
    title: 'Mettons votre bien en location',
    subtitle: 'Trouvez le locataire idéal, seul ou accompagné.',
    actions: [
      { label: 'Publier mon annonce de location', description: 'Diffusez votre bien et recevez des candidatures', to: '/dashboard/annonces/nouvelle', primary: true },
      { label: 'Déléguer la mise en location', description: 'Nous sélectionnons le locataire pour 1 mois de loyer', to: '/contact?service=mise-en-location' }
    ]
  },
  'gestion-locative': {
    title: 'Déléguez la gestion de votre location',
    subtitle: 'Loyers, travaux, litiges : nous nous occupons de tout pour 5% du loyer.',
    actions: [
      { label: 'Demander la gestion locative', description: 'Un conseiller vous rappelle sous 24h', to: '/contact?service=gestion-locative', primary: true },
      { label: 'Découvrir le service en détail', description: 'Tout ce qui est inclus dans la gestion complète', to: '/nos-services/gestion-locative' }
    ]
  },
  'courte-duree': {
    title: 'Lancez votre location courte durée',
    subtitle: 'Avec notre partenaire StayManager.ma : essai gratuit de 14 jours.',
    staymanager: true,
    actions: [
      { label: 'Créer votre compte StayManager', description: 'Plateforme en libre-service dès 179 Đh/bien/mois', href: STAYMANAGER_REGISTER_URL, primary: true },
      { label: 'Connecter StayManager à SemsarOut', description: 'Synchronisez vos biens et réservations', to: '/dashboard/integrations/staymanager' }
    ]
  },
  estimation: {
    title: 'Estimons votre bien gratuitement',
    subtitle: 'Une estimation précise, basée sur le marché local, sans engagement.',
    actions: [
      { label: 'Demander mon estimation', description: 'Un expert analyse votre bien sous 24h', to: '/contact?service=estimation', primary: true },
      { label: 'Publier une annonce', description: 'Vous connaissez déjà votre prix ? Diffusez votre bien', to: '/dashboard/annonces/nouvelle' }
    ]
  },
  autre: {
    title: 'Par où commencer ?',
    subtitle: 'Découvrez ce que SemsarOut peut faire pour vous.',
    actions: [
      { label: 'Publier une annonce', description: 'Vente ou location, diffusez gratuitement', to: '/dashboard/annonces/nouvelle', primary: true },
      { label: 'Découvrir nos services', description: 'Vente, location, gestion, courte durée', to: '/nos-services' },
      { label: 'Parler à un conseiller', description: 'Réponse sous 24h ouvrées', to: '/contact' }
    ]
  }
}

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

  const isNewUser = propertiesData && propertiesData.total === 0
  const onboarding = isNewUser
    ? ONBOARDING[user?.interest] || ONBOARDING.autre
    : null

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
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">
          Bonjour, {user?.first_name} !
        </h1>
        <p className="text-gray-600">
          Bienvenue sur votre tableau de bord
        </p>
      </div>

      {/* Onboarding selon l'intention déclarée */}
      {onboarding && (
        <div className={`card p-6 sm:p-8 mb-8 ${
          onboarding.staymanager
            ? 'bg-gradient-to-r from-[#F5F0E6] via-[#FAF7F2] to-[#ECF4EF] border border-[#E5DFD3]'
            : 'bg-gradient-to-r from-primary-50 to-terracotta-50'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-display text-xl font-bold text-gray-900">
              {onboarding.title}
            </h2>
            {onboarding.staymanager && (
              <span className="hidden sm:flex items-center gap-1.5 ml-2">
                <img src="/staymanager-logo.png" alt="StayManager.ma" className="h-6" />
                <StayManagerWordmark className="text-base" />
              </span>
            )}
          </div>
          <p className="text-gray-600 text-sm mb-6">{onboarding.subtitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {onboarding.actions.map((action, idx) => {
              const inner = (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-semibold ${action.primary ? 'text-white' : 'text-gray-900'}`}>
                      {action.label}
                    </span>
                    {action.href
                      ? <FiExternalLink className={`w-4 h-4 flex-shrink-0 ${action.primary ? 'text-white/80' : 'text-gray-400'}`} />
                      : <FiArrowRight className={`w-4 h-4 flex-shrink-0 ${action.primary ? 'text-white/80' : 'text-gray-400'}`} />}
                  </div>
                  <p className={`text-sm ${action.primary ? 'text-white/85' : 'text-gray-500'}`}>
                    {action.description}
                  </p>
                </>
              )
              const cls = `block p-4 rounded-xl transition-all hover:shadow-md ${
                action.primary
                  ? onboarding.staymanager
                    ? 'bg-gradient-to-r from-[#1F3D34] to-[#2E5E4E]'
                    : 'bg-primary-600 hover:bg-primary-700'
                  : 'bg-white border border-gray-200 hover:border-gray-300'
              }`
              return action.href ? (
                <a key={idx} href={action.href} target="_blank" rel="noopener noreferrer" className={cls}>
                  {inner}
                </a>
              ) : (
                <Link key={idx} to={action.to} className={cls}>
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>
      )}

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
