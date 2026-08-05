import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiCheck, FiX, FiArrowRight, FiZap, FiPhone } from 'react-icons/fi'
import api from '../services/api'
import { DIRHAM_SYMBOL, formatPrice } from '../utils/currency'
import { CONTACT } from '../constants/contact'
import { PRICING } from '../constants/pricing'
import DirIcon from '../components/common/DirIcon'

function AgencyPricing() {
  const { t } = useTranslation(['public'])
  const [billingCycle, setBillingCycle] = useState('yearly')

  const { data: plans } = useQuery('subscription-plans', async () => {
    const response = await api.get('/subscription-plans')
    return response.data.plans
  })

  const defaultPlans = [
    {
      name: t('public:agencyPricing.plans.starter.name'),
      slug: 'starter',
      description: t('public:agencyPricing.plans.starter.description'),
      max_listings: 10,
      max_featured: 1,
      max_urgent: 1,
      has_api_access: false,
      has_csv_import: false,
      has_staymanager_sync: false,
      has_lead_contact: true,
      has_analytics: false,
      has_priority_support: false,
      has_dedicated_account_manager: false,
      price_monthly: PRICING.plans.starter.monthly,
      price_yearly: PRICING.plans.starter.yearly
    },
    {
      name: t('public:agencyPricing.plans.pro.name'),
      slug: 'pro',
      description: t('public:agencyPricing.plans.pro.description'),
      max_listings: 50,
      max_featured: 5,
      max_urgent: 5,
      has_api_access: true,
      has_csv_import: true,
      has_staymanager_sync: true,
      has_lead_contact: true,
      has_analytics: true,
      has_priority_support: false,
      has_dedicated_account_manager: false,
      price_monthly: PRICING.plans.pro.monthly,
      price_yearly: PRICING.plans.pro.yearly,
      popular: true
    },
    {
      name: t('public:agencyPricing.plans.enterprise.name'),
      slug: 'enterprise',
      description: t('public:agencyPricing.plans.enterprise.description'),
      max_listings: -1,
      max_featured: 20,
      max_urgent: 20,
      has_api_access: true,
      has_csv_import: true,
      has_staymanager_sync: true,
      has_lead_contact: true,
      has_analytics: true,
      has_priority_support: true,
      has_dedicated_account_manager: true,
      price_monthly: PRICING.plans.enterprise.monthly,
      price_yearly: PRICING.plans.enterprise.yearly
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
            {t('public:agencyPricing.title')}
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            {t('public:agencyPricing.subtitle')}
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
              {t('public:agencyPricing.billing.monthly')}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('public:agencyPricing.billing.yearly')}
              <span className="ms-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                {t('public:agencyPricing.billing.yearlyDiscount')}
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
                    <FiZap className="inline w-4 h-4 me-1" />
                    {t('public:agencyPricing.popularBadge')}
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
                      <span className="text-gray-600 ms-2">
                        {DIRHAM_SYMBOL}{t('public:agencyPricing.perMonthSuffix')}
                      </span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="text-sm text-gray-500 mt-1">
                        {t('public:agencyPricing.billedYearly', { price: formatPrice(getPrice(plan) + 10) })}
                        {getSavings(plan) > 0 && (
                          <span className="text-green-600 ms-2">
                            {t('public:agencyPricing.savings', { amount: formatPrice(getSavings(plan)) })}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <Link
                    to={`/dashboard/agence?plan=${plan.slug}`}
                    className={`btn w-full justify-center mb-8 ${
                      plan.popular
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {t('public:agencyPricing.ctaButton')}
                    <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
                  </Link>

                  {/* Features */}
                  <ul className="space-y-3">
                    <li className="flex items-center text-sm">
                      <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      <span>
                        {plan.max_listings === -1
                          ? t('public:agencyPricing.features.listingsUnlimited')
                          : t('public:agencyPricing.features.listingsCount', { n: plan.max_listings })}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      <span>{t('public:agencyPricing.features.featuredCount', { n: plan.max_featured })}</span>
                    </li>
                    <li className="flex items-center text-sm">
                      <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      <span>{t('public:agencyPricing.features.urgentCount', { n: plan.max_urgent })}</span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_lead_contact ? (
                        <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 me-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_lead_contact ? 'text-gray-400' : ''}>
                        {t('public:agencyPricing.features.leadContact')}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_api_access ? (
                        <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 me-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_api_access ? 'text-gray-400' : ''}>
                        {t('public:agencyPricing.features.apiAccess')}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_csv_import ? (
                        <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 me-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_csv_import ? 'text-gray-400' : ''}>
                        {t('public:agencyPricing.features.csvImport')}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_analytics ? (
                        <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 me-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_analytics ? 'text-gray-400' : ''}>
                        {t('public:agencyPricing.features.analytics')}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_staymanager_sync ? (
                        <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 me-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_staymanager_sync ? 'text-gray-400' : ''}>
                        {t('public:agencyPricing.features.staymanagerSync')}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_priority_support ? (
                        <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 me-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_priority_support ? 'text-gray-400' : ''}>
                        {t('public:agencyPricing.features.prioritySupport')}
                      </span>
                    </li>
                    <li className="flex items-center text-sm">
                      {plan.has_dedicated_account_manager ? (
                        <FiCheck className="w-5 h-5 text-green-500 me-3 flex-shrink-0" />
                      ) : (
                        <FiX className="w-5 h-5 text-gray-300 me-3 flex-shrink-0" />
                      )}
                      <span className={!plan.has_dedicated_account_manager ? 'text-gray-400' : ''}>
                        {t('public:agencyPricing.features.dedicatedManager')}
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
            {t('public:agencyPricing.comparison.title')}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-xl shadow-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-start p-4 font-medium text-gray-600">{t('public:agencyPricing.comparison.feature')}</th>
                  <th className="p-4 text-center font-medium text-gray-600">{t('public:agencyPricing.plans.starter.name')}</th>
                  <th className="p-4 text-center font-medium text-gray-600 bg-primary-50">{t('public:agencyPricing.plans.pro.name')}</th>
                  <th className="p-4 text-center font-medium text-gray-600">{t('public:agencyPricing.plans.enterprise.name')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.activeListings')}</td>
                  <td className="p-4 text-center">10</td>
                  <td className="p-4 text-center bg-primary-50">50</td>
                  <td className="p-4 text-center">{t('public:agencyPricing.comparison.unlimited')}</td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.photosPerListing')}</td>
                  <td className="p-4 text-center">10</td>
                  <td className="p-4 text-center bg-primary-50">20</td>
                  <td className="p-4 text-center">30</td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.featuredPerMonth')}</td>
                  <td className="p-4 text-center">1</td>
                  <td className="p-4 text-center bg-primary-50">5</td>
                  <td className="p-4 text-center">20</td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.csvImport')}</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.apiRest')}</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.advancedAnalytics')}</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.staymanagerSync')}</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.prioritySupport')}</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.dedicatedManager')}</td>
                  <td className="p-4 text-center"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center bg-primary-50"><FiX className="w-5 h-5 text-gray-300 mx-auto" /></td>
                  <td className="p-4 text-center"><FiCheck className="w-5 h-5 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="p-4 text-gray-900">{t('public:agencyPricing.comparison.dedicatedManager')}</td>
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
            {t('public:agencyPricing.faq.title')}
          </h2>

          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:agencyPricing.faq.q1Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:agencyPricing.faq.q1Answer')}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:agencyPricing.faq.q2Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:agencyPricing.faq.q2Answer')}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:agencyPricing.faq.q3Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:agencyPricing.faq.q3Answer')}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:agencyPricing.faq.q4Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:agencyPricing.faq.q4Answer')}
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
              {t('public:agencyPricing.cta.title')}
            </h2>
            <p className="text-white/90 mb-8 max-w-2xl mx-auto">
              {t('public:agencyPricing.cta.text')}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contact" className="btn bg-white text-primary-600 hover:bg-gray-100">
                {t('public:agencyPricing.cta.contactButton')}
              </Link>
              <a href={`tel:${CONTACT.phoneTel}`} className="btn border-2 border-white text-white hover:bg-white/10">
                <FiPhone className="w-4 h-4 me-2" />
                {CONTACT.phone}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AgencyPricing
