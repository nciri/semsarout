import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FiCheck, FiCamera, FiHome, FiArrowRight, FiPhone,
  FiMail, FiStar, FiClock, FiDollarSign, FiKey,
  FiUsers, FiShield, FiCalendar, FiFileText, FiTool
} from 'react-icons/fi'
import { DIRHAM_SYMBOL } from '../utils/currency'
import StayManagerWordmark from '../components/common/StayManagerWordmark'

const SERVICES = {
  vente: {
    title: 'Forfait Vente',
    subtitle: 'Service d\'agence en ligne',
    price: '4 900',
    priceNote: `${DIRHAM_SYMBOL} TTC - Tarif fixe`,
    description: 'Un accompagnement complet pour vendre votre bien au meilleur prix, sans les commissions exorbitantes des agences traditionnelles.',
    features: [
      'Estimation gratuite de votre bien par un expert',
      'Rédaction d\'une annonce optimisée',
      'Diffusion premium sur SemsarOut',
      'Gestion des demandes de contact',
      'Organisation des visites',
      'Accompagnement jusqu\'à la signature',
      'Conseils juridiques de base'
    ],
    photoService: {
      title: 'Photos Professionnelles incluses',
      features: [
        'Photographe professionnel à domicile',
        '15-20 photos HD retouchées',
        'Mise en valeur optimale des espaces',
        'Livraison sous 48h'
      ],
      options: [
        { name: 'Visite virtuelle 360°', price: `+500 ${DIRHAM_SYMBOL}` },
        { name: 'Prises de vue drone', price: `+800 ${DIRHAM_SYMBOL}` },
        { name: 'Vidéo de présentation', price: `+1 200 ${DIRHAM_SYMBOL}` }
      ]
    },
    notIncluded: [
      'Frais de notaire (à la charge de l\'acheteur)',
      'Diagnostics immobiliers obligatoires'
    ],
    cta: { label: 'Démarrer ma vente en ligne', to: '/vendre' },
    icon: FiHome,
    color: 'primary'
  },
  'gestion-locative': {
    title: 'Gestion Locative Complète',
    subtitle: 'Location longue durée - Sérénité totale',
    price: '5%',
    pricePrefix: 'À partir de',
    priceNote: 'du loyer mensuel (tarif minimum 500 Đh/mois)',
    description: 'Déléguez entièrement la gestion de votre bien locatif. De la recherche du locataire idéal jusqu\'à son départ, nous gérons tout pour vous. Plusieurs formules adaptées à vos besoins.',
    features: [
      'Recherche et sélection rigoureuse des locataires',
      'Vérification approfondie des dossiers (revenus, garants)',
      'Rédaction du bail conforme à la législation',
      'État des lieux d\'entrée détaillé avec photos',
      'Encaissement et suivi des loyers',
      'Gestion des charges et régularisations',
      'Interface propriétaire avec reporting mensuel',
      'Gestion des sinistres et assurances',
      'Coordination des travaux et réparations',
      'Médiation et gestion des litiges',
      'État des lieux de sortie',
      'Restitution du dépôt de garantie'
    ],
    optionsTitle: 'Nos formules de gestion locative',
    options: [
      { name: 'Gestion Essentielle', price: '3% du loyer / min. 300 Đh' },
      { name: 'Gestion Complète', price: '5% du loyer / min. 500 Đh' },
      { name: 'Gestion Premium', price: '7% du loyer / min. 700 Đh' }
    ],
    phases: [
      {
        title: 'Mise en location',
        items: ['Estimation du loyer', 'Photos professionnelles', 'Diffusion multicanale', 'Visites qualifiées']
      },
      {
        title: 'Entrée du locataire',
        items: ['Sélection du dossier', 'Rédaction du bail', 'État des lieux', 'Remise des clés']
      },
      {
        title: 'Vie du bail',
        items: ['Encaissement loyers', 'Quittances', 'Travaux', 'Médiation']
      },
      {
        title: 'Sortie du locataire',
        items: ['Préavis', 'État des lieux sortie', 'Dépôt de garantie', 'Relocation']
      }
    ],
    icon: FiKey,
    color: 'blue'
  },
  'mise-en-location': {
    title: 'Mise en Location',
    subtitle: 'Trouvez le locataire idéal',
    price: '1 mois',
    priceNote: 'de loyer (une seule fois)',
    description: 'Nous trouvons le locataire parfait pour votre bien : sélection rigoureuse, vérification des dossiers, et accompagnement jusqu\'à la signature du bail.',
    features: [
      'Estimation du loyer optimal',
      'Annonce premium sur SemsarOut et partenaires',
      'Réception et tri des candidatures',
      'Vérification approfondie des dossiers',
      'Organisation des visites',
      'Sélection du meilleur profil',
      'Rédaction du contrat de bail',
      'État des lieux d\'entrée',
      'Remise des clés'
    ],
    photoService: {
      title: 'Photos Professionnelles incluses',
      features: [
        'Photographe professionnel à domicile',
        '10-15 photos HD retouchées',
        'Mise en valeur optimale des espaces',
        'Livraison sous 48h'
      ],
      options: [
        { name: 'Visite virtuelle 360°', price: `+500 ${DIRHAM_SYMBOL}` },
        { name: 'Vidéo de présentation', price: `+1 200 ${DIRHAM_SYMBOL}` }
      ]
    },
    notIncluded: [
      'Gestion locative courante (en option)',
      'Garantie loyers impayés (en option)'
    ],
    icon: FiUsers,
    color: 'green'
  },
  'courte-duree': {
    title: 'Location Courte Durée',
    subtitle: 'En partenariat avec StayManager.ma',
    price: '179',
    pricePrefix: 'À partir de',
    priceNote: 'par bien / mois - Essai gratuit de 14 jours',
    description: 'Sécurisez et automatisez vos locations saisonnières avec la plateforme StayManager.ma : vérification d\'identité des voyageurs, serrures connectées, réservations et messagerie automatisée. Tout votre workflow d\'hôte en un seul outil.',
    features: [
      'Vérification d\'identité automatisée des voyageurs',
      'OCR des pièces d\'identité',
      'Serrures connectées : accès automatique pour les voyageurs vérifiés',
      'Synchronisation des calendriers (iCal) avec Airbnb, Booking, etc.',
      'Gestion centralisée des réservations',
      'Automatisation des messages aux voyageurs',
      'Contrats de location et signature digitale',
      'Gestion d\'équipe : ménage, maintenance, co-hôtes',
      'Notifications en temps réel : arrivées, vérifications, accès',
      'Conformité réglementaire (identification des voyageurs)'
    ],
    optionsTitle: 'Formules StayManager.ma',
    options: [
      { name: 'Manage', price: `179 ${DIRHAM_SYMBOL}/bien/mois` },
      { name: 'Automate', price: `299 ${DIRHAM_SYMBOL}/bien/mois` },
      { name: 'Optimize', price: `449 ${DIRHAM_SYMBOL}/bien/mois` }
    ],
    partnership: {
      name: 'StayManager.ma',
      logo: '/staymanager-logo.png',
      registerUrl: 'https://staymanager.ma/register',
      description: 'La plateforme de gestion et de sécurisation des locations courte durée au Maroc'
    },
    icon: FiCalendar,
    color: 'staymanager'
  },
  estimation: {
    title: 'Estimation Gratuite',
    subtitle: 'Connaissez la valeur de votre bien',
    price: 'Gratuit',
    priceNote: 'Sans engagement',
    description: 'Obtenez une estimation précise de votre bien basée sur les données du marché et l\'expertise de nos agents.',
    features: [
      'Analyse comparative du marché local',
      'Prise en compte des caractéristiques du bien',
      'Rapport d\'estimation détaillé',
      'Conseils pour optimiser la valeur',
      'Sans engagement de vente'
    ],
    icon: FiDollarSign,
    color: 'yellow'
  }
}

const SERVICE_CATEGORIES = [
  {
    title: 'Vente',
    services: ['vente', 'estimation'],
    color: 'primary'
  },
  {
    title: 'Location',
    services: ['mise-en-location', 'gestion-locative', 'courte-duree'],
    color: 'blue'
  }
]

function Services() {
  const [activeService, setActiveService] = useState('gestion-locative')
  const service = SERVICES[activeService]
  const Icon = service.icon

  const colorClasses = {
    primary: {
      bg: 'bg-primary-600',
      bgLight: 'bg-primary-100',
      text: 'text-primary-600',
      textLight: 'text-primary-700',
      border: 'border-primary-600',
      hover: 'hover:bg-primary-700'
    },
    terracotta: {
      bg: 'bg-terracotta-600',
      bgLight: 'bg-terracotta-100',
      text: 'text-terracotta-600',
      textLight: 'text-terracotta-700',
      border: 'border-terracotta-600',
      hover: 'hover:bg-terracotta-700'
    },
    blue: {
      bg: 'bg-blue-600',
      bgLight: 'bg-blue-100',
      text: 'text-blue-600',
      textLight: 'text-blue-700',
      border: 'border-blue-600',
      hover: 'hover:bg-blue-700'
    },
    green: {
      bg: 'bg-green-600',
      bgLight: 'bg-green-100',
      text: 'text-green-600',
      textLight: 'text-green-700',
      border: 'border-green-600',
      hover: 'hover:bg-green-700'
    },
    purple: {
      bg: 'bg-purple-600',
      bgLight: 'bg-purple-100',
      text: 'text-purple-600',
      textLight: 'text-purple-700',
      border: 'border-purple-600',
      hover: 'hover:bg-purple-700'
    },
    // Couleurs officielles staymanager.ma : vert #2E5E4E / #1F3D34, beige #F5F0E6, or #C9A24B
    staymanager: {
      bg: 'bg-[#2E5E4E]',
      bgLight: 'bg-[#F5F0E6]',
      bgGradient: 'bg-gradient-to-r from-[#1F3D34] via-[#2E5E4E] to-[#2E5E4E]',
      text: 'text-[#2E5E4E]',
      textLight: 'text-[#1F3D34]',
      border: 'border-[#2E5E4E]',
      hover: 'hover:from-[#152D26] hover:via-[#1F3D34] hover:to-[#1F3D34]'
    },
    yellow: {
      bg: 'bg-yellow-500',
      bgLight: 'bg-yellow-100',
      text: 'text-yellow-600',
      textLight: 'text-yellow-700',
      border: 'border-yellow-500',
      hover: 'hover:bg-yellow-600'
    }
  }

  const colors = colorClasses[service.color]

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-900 to-gray-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl lg:text-5xl font-bold mb-6">
              <span style={{ color: 'rgb(198, 146, 63)' }}>Nos Services</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              Une agence immobilière en ligne complète : vente, location longue durée et gestion locative.
              Des tarifs transparents, un service de qualité professionnelle.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center text-gray-300">
                <FiDollarSign className="w-5 h-5 mr-2 text-yellow-400" />
                <span>Tarifs transparents</span>
              </div>
              <div className="flex items-center text-gray-300">
                <FiShield className="w-5 h-5 mr-2 text-yellow-400" />
                <span>Zéro surprise</span>
              </div>
              <div className="flex items-center text-gray-300">
                <FiClock className="w-5 h-5 mr-2 text-yellow-400" />
                <span>Réponse sous 24h</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service Tabs */}
      <section className="bg-white border-b sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row">
            {/* Category headers on mobile */}
            <div className="flex overflow-x-auto py-2 gap-1">
              {Object.entries(SERVICES).map(([key, svc]) => {
                const SvcIcon = svc.icon
                const isActive = activeService === key
                return (
                  <button
                    key={key}
                    onClick={() => setActiveService(key)}
                    className={`flex items-center px-4 py-3 font-medium whitespace-nowrap rounded-lg transition-colors ${
                      isActive
                        ? `${colorClasses[svc.color].bgLight} ${colorClasses[svc.color].text}`
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <SvcIcon className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">{svc.title}</span>
                    <span className="sm:hidden">{svc.title.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Service Detail */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <div className="mb-8">
                <div className={`inline-flex items-center px-3 py-1 ${colors.bgLight} ${colors.textLight} rounded-full text-sm font-medium mb-4`}>
                  <Icon className="w-4 h-4 mr-2" />
                  {service.partnership ? (
                    <>
                      En partenariat avec
                      <img src={service.partnership.logo} alt={service.partnership.name} className="h-5 ml-1.5" />
                    </>
                  ) : service.subtitle}
                </div>
                <h2 className="font-display text-3xl font-bold text-gray-900 mb-4">
                  {service.title}
                </h2>
                <p className="text-lg text-gray-600">
                  {service.description}
                </p>
              </div>

              {/* Partnership badge for StayManager */}
              {service.partnership && (
                <div className="mb-8 p-6 bg-gradient-to-r from-[#F5F0E6] via-[#FAF7F2] to-[#ECF4EF] rounded-xl border border-[#E5DFD3]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-[#C9A24B] font-medium mb-1">En partenariat avec</div>
                      <div className="flex items-center gap-2">
                        <img src={service.partnership.logo} alt={service.partnership.name} className="h-8" />
                        <StayManagerWordmark className="text-xl" />
                      </div>
                      <div className="text-sm text-gray-600">{service.partnership.description}</div>
                    </div>
                    <a
                      href="https://www.staymanager.ma"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn bg-gradient-to-r from-[#1F3D34] via-[#2E5E4E] to-[#2E5E4E] text-white hover:opacity-90 transition-opacity"
                    >
                      En savoir plus
                      <FiArrowRight className="w-4 h-4 ml-2" />
                    </a>
                  </div>
                </div>
              )}

              {/* Phases for gestion locative */}
              {service.phases && (
                <div className="mb-8">
                  <h3 className="font-semibold text-lg mb-6">Notre accompagnement de A à Z</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {service.phases.map((phase, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-xl p-5">
                        <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold text-sm mb-3`}>
                          {idx + 1}
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-2">{phase.title}</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {phase.items.map((item, i) => (
                            <li key={i} className="flex items-center">
                              <FiCheck className={`w-3 h-3 ${colors.text} mr-2 flex-shrink-0`} />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Features */}
              <div className="mb-8">
                <h3 className="font-semibold text-lg mb-4">Ce qui est inclus</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {service.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <FiCheck className={`w-5 h-5 ${colors.text} mr-3 mt-0.5 flex-shrink-0`} />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Photo Service - Included sub-service */}
              {service.photoService && (
                <div className="mb-8 bg-gradient-to-br from-terracotta-50 to-orange-50 rounded-xl p-6 border border-terracotta-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-terracotta-100 rounded-lg flex items-center justify-center">
                      <FiCamera className="w-5 h-5 text-terracotta-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{service.photoService.title}</h3>
                      <span className="text-xs text-terracotta-600 font-medium">Service inclus</span>
                    </div>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {service.photoService.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-sm">
                        <FiCheck className="w-4 h-4 text-terracotta-500 mr-2 flex-shrink-0" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {service.photoService.options && (
                    <div className="pt-4 border-t border-terracotta-100">
                      <p className="text-sm font-medium text-gray-700 mb-3">Options supplémentaires :</p>
                      <div className="flex flex-wrap gap-2">
                        {service.photoService.options.map((option, idx) => (
                          <span key={idx} className="inline-flex items-center px-3 py-1.5 bg-white rounded-full text-sm">
                            <span className="text-gray-700">{option.name}</span>
                            <span className="ml-2 text-terracotta-600 font-medium">{option.price}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Not Included */}
              {service.notIncluded && (
                <div className="mb-8">
                  <h3 className="font-semibold text-lg mb-4">Non inclus</h3>
                  <ul className="space-y-2">
                    {service.notIncluded.map((item, idx) => (
                      <li key={idx} className="flex items-start text-gray-500">
                        <span className="w-5 h-5 mr-3 text-center">-</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Options */}
              {service.options && (
                <div className="mb-8">
                  <h3 className="font-semibold text-lg mb-4">{service.optionsTitle || 'Options disponibles'}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {service.options.map((option, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-4">
                        <div className="font-medium text-gray-900">{option.name}</div>
                        <div className={`${colors.text} font-semibold`}>{option.price}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Process */}
              {!service.phases && (
                <div className="bg-gray-50 rounded-2xl p-8">
                  <h3 className="font-semibold text-lg mb-6">Comment ça marche ?</h3>
                  <div className="space-y-6">
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0`}>
                        1
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Contactez-nous</div>
                        <div className="text-gray-600 text-sm">Remplissez le formulaire ou appelez-nous pour discuter de votre projet.</div>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0`}>
                        2
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Visite et évaluation</div>
                        <div className="text-gray-600 text-sm">Un expert se déplace pour évaluer votre bien et vos besoins.</div>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0`}>
                        3
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Mise en place</div>
                        <div className="text-gray-600 text-sm">Nous mettons en œuvre le service choisi avec transparence.</div>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0`}>
                        4
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Suivi personnalisé</div>
                        <div className="text-gray-600 text-sm">Vous restez informé à chaque étape via votre espace client.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar - Pricing Card */}
            <div className="lg:col-span-1">
              <div className="sticky top-32">
                <div className={`bg-white rounded-2xl shadow-lg border-2 ${colors.border} overflow-hidden`}>
                  <div className={`${colors.bgGradient || colors.bg} text-white p-6`}>
                    <div className="flex items-center mb-2">
                      <Icon className="w-6 h-6 mr-2" />
                      {service.partnership ? (
                        <span className="text-sm opacity-90 flex items-center">
                          En partenariat avec
                          <img src={service.partnership.logo} alt={service.partnership.name} className="h-5 ml-1.5" />
                          <StayManagerWordmark light className="ml-1.5 text-base" />
                        </span>
                      ) : (
                        <span className="text-sm opacity-90">{service.subtitle}</span>
                      )}
                    </div>
                    {service.pricePrefix && (
                      <div className="text-sm opacity-90">{service.pricePrefix}</div>
                    )}
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold">{service.price}</span>
                      {service.price !== 'Gratuit' && !service.price.includes('%') && !service.price.includes('mois') && (
                        <span className="ml-2 text-lg">{DIRHAM_SYMBOL}</span>
                      )}
                    </div>
                    <div className="text-sm opacity-90 mt-1">{service.priceNote}</div>
                  </div>

                  <div className="p-6">
                    {service.cta ? (
                      <Link
                        to={service.cta.to}
                        className={`btn ${colors.bgGradient || colors.bg} text-white ${colors.bgGradient ? 'hover:opacity-90' : colors.hover} w-full justify-center mb-4`}
                      >
                        {service.cta.label}
                        <FiArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    ) : service.partnership?.registerUrl ? (
                      <a
                        href={service.partnership.registerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`btn ${colors.bgGradient || colors.bg} text-white hover:opacity-90 w-full justify-center mb-4`}
                      >
                        Créer votre compte StayManager
                        <FiArrowRight className="w-4 h-4 ml-2" />
                      </a>
                    ) : (
                      <Link
                        to={`/contact?service=${activeService}`}
                        className={`btn ${colors.bgGradient || colors.bg} text-white ${colors.bgGradient ? 'hover:opacity-90' : colors.hover} w-full justify-center mb-4`}
                      >
                        {service.price === 'Gratuit' ? 'Demander une estimation' : 'Demander un devis'}
                        <FiArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    )}

                    <div className="text-center text-sm text-gray-500 mb-6">
                      ou appelez-nous
                    </div>

                    <a
                      href="tel:+212600000000"
                      className="flex items-center justify-center text-gray-700 hover:text-primary-600"
                    >
                      <FiPhone className="w-5 h-5 mr-2" />
                      +212 6 00 00 00 00
                    </a>
                  </div>
                </div>

                {/* Trust badges */}
                <div className="mt-6 bg-gray-50 rounded-xl p-6">
                  <div className="text-center text-sm text-gray-500 mb-4">Ils nous font confiance</div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">500+</div>
                      <div className="text-xs text-gray-500">Biens gérés</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">98%</div>
                      <div className="text-xs text-gray-500">Satisfaits</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">24h</div>
                      <div className="text-xs text-gray-500">Réactivité</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Overview Grid */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-gray-900 text-center mb-12">
            Tous nos services en un coup d'œil
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(SERVICES).map(([key, svc]) => {
              const SvcIcon = svc.icon
              const svcColors = colorClasses[svc.color]
              return (
                <button
                  key={key}
                  onClick={() => {
                    setActiveService(key)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className={`text-left bg-white rounded-xl p-6 shadow-sm border-2 transition-all hover:shadow-md ${
                    activeService === key ? svcColors.border : 'border-transparent'
                  }`}
                >
                  <div className={`w-12 h-12 ${svcColors.bgLight} rounded-xl flex items-center justify-center mb-4`}>
                    <SvcIcon className={`w-6 h-6 ${svcColors.text}`} />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{svc.title}</h3>
                  <p className="text-sm text-gray-500 mb-3">{svc.subtitle}</p>
                  <div className={`text-lg font-bold ${svcColors.text}`}>
                    {svc.price} {!svc.price.includes('%') && !svc.price.includes('mois') && svc.price !== 'Gratuit' && DIRHAM_SYMBOL}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-gray-900 mb-8 text-center">
            Questions fréquentes
          </h2>

          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Comment fonctionne la gestion locative ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                Nous prenons en charge l'intégralité de la gestion de votre bien : recherche de locataires,
                vérification des dossiers, rédaction du bail, états des lieux, encaissement des loyers,
                gestion des travaux et des litiges, jusqu'à la sortie du locataire.
                Vous recevez un reporting mensuel détaillé.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Qu'est-ce que le partenariat avec StayManager ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                StayManager.ma est la plateforme marocaine de gestion et de sécurisation des locations
                courte durée. Grâce à notre partenariat, vous pilotez vos biens en toute sécurité :
                vérification d'identité des voyageurs, serrures connectées, synchronisation des calendriers
                (Airbnb, Booking), messages automatisés, contrats digitaux et gestion d'équipe.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Quels sont les frais de gestion locative ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                Nos frais de gestion locative sont de 5% du loyer mensuel (charges comprises).
                Pour la mise en location seule (sans gestion), nous facturons l'équivalent d'un mois de loyer.
                Pour la location courte durée, la plateforme StayManager.ma propose des formules
                à partir de 179 {DIRHAM_SYMBOL} par bien et par mois, avec 14 jours d'essai gratuit.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Comment sont sélectionnés les locataires ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                Nous appliquons une sélection rigoureuse : vérification des revenus (minimum 3x le loyer),
                contrôle des pièces justificatives, analyse de la situation professionnelle,
                vérification des garants le cas échéant, et contact avec les anciens propriétaires si possible.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-primary-600 to-terracotta-600 rounded-2xl p-8 lg:p-12 text-white text-center">
            <h2 className="font-display text-2xl lg:text-3xl font-bold mb-4">
              Besoin d'un conseil personnalisé ?
            </h2>
            <p className="text-white/90 mb-8 max-w-2xl mx-auto">
              Nos experts sont à votre disposition pour vous accompagner dans votre projet immobilier,
              que ce soit pour vendre, louer ou gérer votre bien.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contact" className="btn bg-white text-primary-600 hover:bg-gray-100">
                <FiMail className="w-4 h-4 mr-2" />
                Nous contacter
              </Link>
              <a href="tel:+212600000000" className="btn border-2 border-white text-white hover:bg-white/10">
                <FiPhone className="w-4 h-4 mr-2" />
                +212 6 00 00 00 00
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Services
