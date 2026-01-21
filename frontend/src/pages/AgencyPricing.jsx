import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { FiCheck, FiX, FiArrowRight, FiZap, FiPhone } from 'react-icons/fi'
import api from '../services/api'

function AgencyPricing() {
  const [billingCycle, setBillingCycle] = useState('yearly')

  const { data: plans } = useQuery('subscription-plans', async () => {
    const response = await api.get('/subscription-plans')
    return response.data.plans
  })

  const defaultPlans = [
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Idéal pour démarrer',
      max_listings: 10,
      max_featured: 1,
      max_urgent: 1,
      has_api_access: false,
      has_csv_import: false,
      has_staymanager_sync: false,
      has_lead_contact: true,
      has_analytics: false,
      has_priority_support: false,
      price_monthly: 299,
      price_yearly: 2990
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'Pour les agences en croissance',
      max_listings: 50,
      max_featured: 5,
      max_urgent: 5,
      has_api_access: true,
      has_csv_import: true,
      has_staymanager_sync: false,
      has_lead_contact: true,
      has_analytics: true,
      has_priority_support: false,
      price_monthly: 799,
      price_yearly: 7990,
      popular: true
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Solution complète',
      max_listings: -1,
      max_featured: 20,
      max_urgent: 20,
      has_api_access: true,
      has_csv_import: true,
      has_staymanager_sync: true,
      has_lead_contact: true,
      has_analytics: true,
      has_priority_support: true,
      price_monthly: 1999,
      price_yearly: 19990
    }
  ]

  const displayPlans = plans || defaultPlans

  const getPrice = (plan) => {
    return billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
  }

  const getMonthlyEquivalent = (plan) => {
    if (billingCycle === 'yearly') {
      return Math.round(plan.price_yearly / 12)
    }
    return plan.price_monthly
  }

  const getSavings = (plan) => {
    if (billingCycle === 'yearly') {
      const yearlyCost = plan.price_yearly
      const monthlyCost = plan.price_monthly * 12
      return monthlyCost - yearlyCost
    }
    return 0
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-gray-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-6">
            Tarifs Agences Partenaires
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            Développez votre activité avec SemsarOut. Des outils puissants pour gérer
            vos annonces et générer plus de leads qualifiés.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center bg-gray-800 rounded-full p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Annuel
              <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                -17%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20 -mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {displayPlans.map((plan) => (
              <div
                key={plan.slug}
                className={`relative bg-white rounded-2xl shadow-lg overflow-hidden ${
                  plan.popular ? 'ring-2 ring-primary-600' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-0 right-0 bg-primary-600 text-white text-center py-1 text-sm font-medium">
                    <FiZap className="inline w-4 h-4 mr-1" />
                    Le plus populaire
                  </div>
                )}

                <div className={`p-8 ${plan.popular ? 'pt-12' : ''}`}>
                  <h3 className="font-display text-xl font-bold text-gray-900 mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-gray-600 text-sm mb-6">{plan.description}</p>

                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-gray-900">
                        {getMonthlyEquivalent(plan).toLocaleString()}
                      </span>
                      <span className="text-gray-600 ml-2">Đ/mois</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="text-sm text-gray-500 mt-1">
                        Facturé ~{(getPrice(plan)+10).toLocaleString()} Đ/an
                        {getSavings(plan) > 0 && (
                          <span className="text-green-600 ml-2">
                            (économisez {getSavings(plan).toLocaleString()} Đ)
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <Link
                    to={`/agences/inscription?plan=${plan.slug}`}
                    className={`btn w-full justify-center mb-8 ${
                      plan.popular
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    Commencer maintenant
                    <FiArrowRight className="w-4 h-4 ml-2" />
                  </Link>

                  {/* Features */}
                  <ul className="space-y-3">
                    <li className="flex items-center text-sm">
                      <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      <span>
                        {plan.max_listings === -1
                          ? 'Annonces illimitées'
                          : `${plan.max_listings} annonces actives`}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      <span>{plan.max_featured} annonces mises en avant/mois</span>
                    </li>
                    <li className="flex items-center text-sm">
                      <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      <span>{plan.max_urgent} badges "Urgent"/mois</span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_lead_contact ? (
                        <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 mr-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_lead_contact ? 'text-gray-400' : ''}>
                        Accès aux contacts
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_api_access ? (
                        <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 mr-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_api_access ? 'text-gray-400' : ''}>
                        Accès API REST
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_csv_import ? (
                        <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 mr-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_csv_import ? 'text-gray-400' : ''}>
                        Import CSV
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_analytics ? (
                        <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 mr-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_analytics ? 'text-gray-400' : ''}>
                        Tableau de bord analytics
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_staymanager_sync ? (
                        <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 mr-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_staymanager_sync ? 'text-gray-400' : ''}>
                        Sync StayManager
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_priority_support ? (
                        <FiCheck className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 mr-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_priority_support ? 'text-gray-400' : ''}>
                        Support prioritaire
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Comparison */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-gray-900 text-center mb-12">
            Comparatif détaillé
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-xl shadow-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-gray-600">Fonctionnalité</th>
                  <th className="p-4 text-center font-medium text-gray-600">Starter</th>
                  <th className="p-4 text-center font-medium text-gray-600 bg-primary-50">Pro</th>
                  <th className="p-4 text-center font-medium text-gray-600">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-4 text-gray-900">Annonces actives</td>
                  <td className="p-4 text-center">10</td>
                  <td className="p-4 text-center bg-primary-50">50</td>
                  <td className="p-4 text-center">Illimité</td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">Photos par annonce</td>
                  <td className="p-4 text-center">10</td>
                  <td className="p-4 text-center bg-primary-50">20</td>
                  <td className="p-4 text-center">30</td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">Mises en avant/mois</td>
                  <td className="p-4 text-center">1</td>
                  <td className="p-4 text-center bg-primary-50">5</td>
                  <td className="p-4 text-center">20</td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">Import CSV</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">API REST</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">Analytics avancés</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">Sync StayManager</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">Support prioritaire</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">Account manager dédié</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-gray-900 text-center mb-12">
            Questions fréquentes
          </h2>

          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Puis-je changer de plan à tout moment ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                Oui, vous pouvez upgrader votre plan à tout moment. Le changement est effectif immédiatement
                et vous ne payez que la différence au prorata. Pour downgrader, le changement prendra effet
                à la fin de votre période de facturation en cours.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Comment fonctionne la facturation ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                La facturation s'effectue au début de chaque période (mensuelle ou annuelle).
                Vous recevez une facture par email et pouvez la télécharger depuis votre tableau de bord.
                Nous acceptons les cartes bancaires et les virements bancaires.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Y a-t-il un engagement minimum ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                Non, aucun engagement minimum. Vous pouvez annuler votre abonnement à tout moment.
                Pour les abonnements annuels, vous bénéficiez d'une garantie satisfait ou remboursé de 30 jours.
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                Comment fonctionne l'API ?
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                Notre API REST vous permet de synchroniser automatiquement vos annonces avec votre logiciel métier.
                Vous recevez une clé API unique dans votre tableau de bord, accompagnée d'une documentation complète.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-primary-600 to-terracotta-600 rounded-2xl p-8 lg:p-12 text-white text-center">
            <h2 className="font-display text-2xl lg:text-3xl font-bold mb-4">
              Besoin d'une offre sur mesure ?
            </h2>
            <p className="text-white/90 mb-8 max-w-2xl mx-auto">
              Nous proposons des solutions personnalisées pour les réseaux d'agences,
              promoteurs et grands comptes. Contactez-nous pour discuter de vos besoins.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contact" className="btn bg-white text-primary-600 hover:bg-gray-100">
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

export default AgencyPricing
