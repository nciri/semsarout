import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import {
  FiArrowRight, FiCheck, FiCamera, FiDollarSign,
  FiShield, FiTrendingUp, FiUsers, FiZap
} from 'react-icons/fi'
import AdvancedSearch from '../components/search/AdvancedSearch'
import PropertyCard from '../components/common/PropertyCard'
import { propertyService } from '../services/propertyService'

function Home() {
  const { data: featuredData } = useQuery(
    'featured-properties',
    () => propertyService.getProperties({ per_page: 6, sort: 'newest' })
  )

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-terracotta-600 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[url('/pattern.svg')] opacity-10"></div>

        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-terracotta-500/20 rounded-full blur-3xl"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm mb-6">
              <FiZap className="w-4 h-4 mr-2 text-yellow-400" />
              <span>La nouvelle ère de l'immobilier au Maroc</span>
            </div>

            <h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 leading-tight">
              L'immobilier sans les
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-terracotta-300"> intermédiaires douteux</span>
            </h1>

            <p className="text-xl text-primary-100 mb-8 leading-relaxed">
              Fini les pratiques artisanales opaques. SemsarOut révolutionne l'accès à l'immobilier
              au Maroc avec transparence, équité et des tarifs fixes sans commission cachée.
            </p>

            <div className="flex flex-wrap gap-4 mb-10">
              <div className="flex items-center text-primary-100">
                <FiCheck className="w-5 h-5 mr-2 text-green-400" />
                <span>Tarif fixe, pas de commission</span>
              </div>
              <div className="flex items-center text-primary-100">
                <FiCheck className="w-5 h-5 mr-2 text-green-400" />
                <span>Photos professionnelles incluses</span>
              </div>
              <div className="flex items-center text-primary-100">
                <FiCheck className="w-5 h-5 mr-2 text-green-400" />
                <span>Accompagnement personnalisé</span>
              </div>
            </div>
          </div>

          {/* Search Form */}
          <div className="max-w-5xl">
            <AdvancedSearch />
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-2xl">
            <div>
              <div className="text-3xl font-bold">0%</div>
              <div className="text-primary-200 text-sm">Commission</div>
            </div>
            <div>
              <div className="text-3xl font-bold">4900 Đ</div>
              <div className="text-primary-200 text-sm">Forfait fixe</div>
            </div>
            <div>
              <div className="text-3xl font-bold">100%</div>
              <div className="text-primary-200 text-sm">Transparent</div>
            </div>
            <div>
              <div className="text-3xl font-bold">24h</div>
              <div className="text-primary-200 text-sm">Publication</div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
              Pourquoi nous court-circuitons les intermédiaires traditionnels ?
            </h2>
            <p className="text-xl text-gray-600">
              Le marché immobilier marocain mérite mieux que des pratiques opaques et des commissions exorbitantes.
              Nous rendons l'immobilier accessible à tous, avec des prix justes et une transparence totale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Problem/Solution Cards */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-600 rounded-2xl transform rotate-1 group-hover:rotate-2 transition-transform"></div>
              <div className="relative bg-white rounded-2xl p-8 shadow-lg">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-6">
                  <span className="text-2xl">❌</span>
                </div>
                <h3 className="font-semibold text-lg mb-3 text-gray-900">Commissions abusives</h3>
                <p className="text-gray-600 mb-4">
                  Les agences traditionnelles prélèvent 2,5% à 5% du prix de vente.
                  Sur un bien à 2M Đ, c'est jusqu'à 100 000 Đ !
                </p>
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-primary-600 font-medium flex items-center">
                    <FiCheck className="w-4 h-4 mr-2" />
                    Chez nous : forfait fixe de 4900 Đ
                  </p>
                </div>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl transform -rotate-1 group-hover:-rotate-2 transition-transform"></div>
              <div className="relative bg-white rounded-2xl p-8 shadow-lg">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-6">
                  <span className="text-2xl">❌</span>
                </div>
                <h3 className="font-semibold text-lg mb-3 text-gray-900">Manque de transparence</h3>
                <p className="text-gray-600 mb-4">
                  Annonces gonflées, informations cachées, négociations opaques...
                  Difficile de faire confiance.
                </p>
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-primary-600 font-medium flex items-center">
                    <FiCheck className="w-4 h-4 mr-2" />
                    Chez nous : tout est visible et vérifié
                  </p>
                </div>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-2xl transform rotate-1 group-hover:rotate-2 transition-transform"></div>
              <div className="relative bg-white rounded-2xl p-8 shadow-lg">
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-6">
                  <span className="text-2xl">❌</span>
                </div>
                <h3 className="font-semibold text-lg mb-3 text-gray-900">Photos amateur</h3>
                <p className="text-gray-600 mb-4">
                  Des photos floues prises au téléphone qui ne mettent pas en valeur votre bien.
                </p>
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-primary-600 font-medium flex items-center">
                    <FiCheck className="w-4 h-4 mr-2" />
                    Chez nous : shooting pro inclus
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Services */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Nos services d'agence en ligne
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Un accompagnement professionnel à tarif fixe, sans surprise
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Service 1 - Vente */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="inline-block px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium mb-4">
                    Vente de bien
                  </span>
                  <h3 className="font-display text-2xl font-bold text-gray-900">
                    Forfait Vente
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary-600">4 900 Đ</div>
                  <div className="text-sm text-gray-500">tarif fixe TTC</div>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Shooting photo professionnel (15-20 photos HD)</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Estimation gratuite de votre bien</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Annonce premium diffusée sur SemsarOut</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Gestion des contacts et visites</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Accompagnement jusqu'à la vente</span>
                </li>
              </ul>

              <Link to="/nos-services/vente" className="btn-primary w-full justify-center">
                Vendre mon bien
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>

            {/* Service 2 - Photos Pro */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="inline-block px-3 py-1 bg-terracotta-100 text-terracotta-700 rounded-full text-sm font-medium mb-4">
                    Service Photo
                  </span>
                  <h3 className="font-display text-2xl font-bold text-gray-900">
                    Photos Professionnelles
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-terracotta-600">990 Đ</div>
                  <div className="text-sm text-gray-500">à partir de</div>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <FiCamera className="w-5 h-5 text-terracotta-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Photographe professionnel à domicile</span>
                </li>
                <li className="flex items-start">
                  <FiCamera className="w-5 h-5 text-terracotta-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">10-20 photos HD retouchées</span>
                </li>
                <li className="flex items-start">
                  <FiCamera className="w-5 h-5 text-terracotta-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Visite virtuelle 360° (option)</span>
                </li>
                <li className="flex items-start">
                  <FiCamera className="w-5 h-5 text-terracotta-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Prises de vue drone (option)</span>
                </li>
                <li className="flex items-start">
                  <FiCamera className="w-5 h-5 text-terracotta-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Livraison sous 48h</span>
                </li>
              </ul>

              <Link to="/nos-services/photos" className="btn bg-terracotta-600 text-white hover:bg-terracotta-700 w-full justify-center">
                Réserver un shooting
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          </div>

          {/* Comparison */}
          <div className="mt-16 bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-8 lg:p-12 text-white">
            <h3 className="font-display text-2xl font-bold mb-8 text-center">
              Comparez et économisez
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-gray-400 mb-2">Agence traditionnelle</div>
                <div className="text-3xl font-bold text-red-400">50 000 Đ</div>
                <div className="text-sm text-gray-400">2,5% sur un bien à 2M Đ</div>
              </div>
              <div className="text-center">
                <div className="text-yellow-400 mb-2">SemsarOut</div>
                <div className="text-4xl font-bold text-yellow-400">4 900 Đ</div>
                <div className="text-sm text-gray-400">Forfait fixe, tout compris</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400 mb-2">Vous économisez</div>
                <div className="text-3xl font-bold text-green-400">45 100 Đ</div>
                <div className="text-sm text-gray-400">90% d'économie !</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="font-display text-2xl font-bold text-gray-900">Dernières annonces</h2>
            <p className="text-gray-600">Découvrez les biens récemment ajoutés</p>
          </div>
          <Link to="/annonces" className="text-primary-600 hover:text-primary-700 flex items-center font-medium">
            Voir tout <FiArrowRight className="ml-2" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredData?.properties?.map(property => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl font-bold text-gray-900 mb-4">
              Pourquoi choisir SemsarOut ?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiDollarSign className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Tarif fixe</h3>
              <p className="text-gray-600 text-sm">
                Pas de commission, un prix clair et définitif.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiShield className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Transparence</h3>
              <p className="text-gray-600 text-sm">
                Toutes les informations sont vérifiées et accessibles.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-terracotta-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiTrendingUp className="w-8 h-8 text-terracotta-600" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Efficacité</h3>
              <p className="text-gray-600 text-sm">
                Publication en 24h, accompagnement personnalisé.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiUsers className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Accessibilité</h3>
              <p className="text-gray-600 text-sm">
                L'immobilier pour tous, sans barrière financière.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA for Agencies */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-r from-terracotta-600 to-primary-600 rounded-2xl p-8 lg:p-12 text-white">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold mb-4">
                Vous êtes une agence immobilière ?
              </h2>
              <p className="text-white/90 mb-6">
                Rejoignez SemsarOut et bénéficiez d'outils puissants pour gérer vos annonces :
                intégration API, import CSV, synchronisation avec vos logiciels métiers.
              </p>
              <ul className="space-y-2 mb-8">
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 mr-2" />
                  Plans d'abonnement flexibles
                </li>
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 mr-2" />
                  API REST pour synchronisation
                </li>
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 mr-2" />
                  Tableau de bord analytics
                </li>
              </ul>
              <Link to="/agences/inscription" className="btn bg-white text-primary-600 hover:bg-gray-100">
                Créer mon espace agence
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
            <div className="hidden lg:block">
              <img
                src="/agency-dashboard.svg"
                alt="Dashboard agence"
                className="w-full opacity-90"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
