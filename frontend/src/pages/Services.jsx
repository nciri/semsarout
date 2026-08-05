import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiCheck, FiCamera, FiHome, FiArrowRight, FiPhone,
  FiMail, FiClock, FiDollarSign, FiKey,
  FiUsers, FiShield, FiCalendar
} from 'react-icons/fi'
import { DIRHAM_SYMBOL } from '../utils/currency'
import StayManagerWordmark from '../components/common/StayManagerWordmark'
import DirIcon from '../components/common/DirIcon'
import { CONTACT } from '../constants/contact'
import { PRICING, priceLabel, priceWithSymbol } from '../constants/pricing'

function buildServices(t) {
  return {
    vente: {
      title: t('public:services.vente.title'),
      subtitle: t('public:services.vente.subtitle'),
      price: priceLabel(PRICING.agencyForfait),
      priceNote: t('public:services.vente.priceNote'),
      description: t('public:services.vente.description'),
      features: t('public:services.vente.features', { returnObjects: true }),
      photoService: {
        title: t('public:services.vente.photoService.title'),
        features: t('public:services.vente.photoService.features', { returnObjects: true }),
        options: [
          { name: t('public:services.vente.photoService.options.virtualTour360'), price: `+${priceWithSymbol(PRICING.addons.virtualTour360)}` },
          { name: t('public:services.vente.photoService.options.drone'), price: `+${priceWithSymbol(PRICING.addons.drone)}` },
          { name: t('public:services.vente.photoService.options.video'), price: `+${priceWithSymbol(PRICING.addons.video)}` }
        ]
      },
      notIncluded: t('public:services.vente.notIncluded', { returnObjects: true }),
      cta: { label: t('public:services.vente.ctaLabel'), to: '/vendre' },
      icon: FiHome,
      color: 'primary',
      showCurrency: true
    },
    'gestion-locative': {
      title: t('public:services.gestion-locative.title'),
      subtitle: t('public:services.gestion-locative.subtitle'),
      price: '5%',
      pricePrefix: t('public:services.gestion-locative.pricePrefix'),
      priceNote: t('public:services.gestion-locative.priceNote'),
      description: t('public:services.gestion-locative.description'),
      features: t('public:services.gestion-locative.features', { returnObjects: true }),
      optionsTitle: t('public:services.gestion-locative.optionsTitle'),
      options: t('public:services.gestion-locative.options', { returnObjects: true }),
      phases: t('public:services.gestion-locative.phases', { returnObjects: true }),
      icon: FiKey,
      color: 'blue',
      showCurrency: false
    },
    'mise-en-location': {
      title: t('public:services.mise-en-location.title'),
      subtitle: t('public:services.mise-en-location.subtitle'),
      price: t('public:services.mise-en-location.priceLabel'),
      priceNote: t('public:services.mise-en-location.priceNote'),
      description: t('public:services.mise-en-location.description'),
      features: t('public:services.mise-en-location.features', { returnObjects: true }),
      photoService: {
        title: t('public:services.mise-en-location.photoService.title'),
        features: t('public:services.mise-en-location.photoService.features', { returnObjects: true }),
        options: [
          { name: t('public:services.mise-en-location.photoService.options.virtualTour360'), price: `+${priceWithSymbol(PRICING.addons.virtualTour360)}` },
          { name: t('public:services.mise-en-location.photoService.options.video'), price: `+${priceWithSymbol(PRICING.addons.video)}` }
        ]
      },
      notIncluded: t('public:services.mise-en-location.notIncluded', { returnObjects: true }),
      icon: FiUsers,
      color: 'green',
      showCurrency: false
    },
    'courte-duree': {
      title: t('public:services.courte-duree.title'),
      subtitle: t('public:services.courte-duree.subtitle'),
      price: '179',
      pricePrefix: t('public:services.courte-duree.pricePrefix'),
      priceNote: t('public:services.courte-duree.priceNote'),
      description: t('public:services.courte-duree.description'),
      features: t('public:services.courte-duree.features', { returnObjects: true }),
      optionsTitle: t('public:services.courte-duree.optionsTitle'),
      options: [
        { name: t('public:services.courte-duree.options.manage'), price: t('public:services.courte-duree.optionPrice', { amount: PRICING.staymanager.manage, currency: DIRHAM_SYMBOL }) },
        { name: t('public:services.courte-duree.options.automate'), price: t('public:services.courte-duree.optionPrice', { amount: PRICING.staymanager.automate, currency: DIRHAM_SYMBOL }) },
        { name: t('public:services.courte-duree.options.optimize'), price: t('public:services.courte-duree.optionPrice', { amount: PRICING.staymanager.optimize, currency: DIRHAM_SYMBOL }) }
      ],
      partnership: {
        name: 'StayManager.ma',
        logo: '/staymanager-logo.png',
        registerUrl: 'https://staymanager.ma/register',
        description: t('public:services.courte-duree.partnership.description')
      },
      icon: FiCalendar,
      color: 'staymanager',
      showCurrency: true
    },
    estimation: {
      title: t('public:services.estimation.title'),
      subtitle: t('public:services.estimation.subtitle'),
      price: t('public:services.estimation.priceLabel'),
      priceNote: t('public:services.estimation.priceNote'),
      description: t('public:services.estimation.description'),
      features: t('public:services.estimation.features', { returnObjects: true }),
      icon: FiDollarSign,
      color: 'yellow',
      isFree: true,
      showCurrency: false
    }
  }
}

function Services() {
  const { t } = useTranslation(['public'])
  const [activeService, setActiveService] = useState('gestion-locative')
  const SERVICES = buildServices(t)
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
              <span style={{ color: 'rgb(198, 146, 63)' }}>{t('public:services.title')}</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              {t('public:services.subtitle')}
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center text-gray-300">
                <FiDollarSign className="w-5 h-5 me-2 text-yellow-400" />
                <span>{t('public:services.badges.transparentPricing')}</span>
              </div>
              <div className="flex items-center text-gray-300">
                <FiShield className="w-5 h-5 me-2 text-yellow-400" />
                <span>{t('public:services.badges.noSurprise')}</span>
              </div>
              <div className="flex items-center text-gray-300">
                <FiClock className="w-5 h-5 me-2 text-yellow-400" />
                <span>{t('public:services.badges.response24h')}</span>
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
                    <SvcIcon className="w-4 h-4 me-2" />
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
                  <Icon className="w-4 h-4 me-2" />
                  {service.partnership ? (
                    <>
                      {t('public:services.partnershipPrefix')}
                      <img src={service.partnership.logo} alt={service.partnership.name} className="h-5 ms-1.5" />
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
                      <div className="text-sm text-[#C9A24B] font-medium mb-1">{t('public:services.partnershipPrefix')}</div>
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
                      {t('public:services.learnMore')}
                      <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
                    </a>
                  </div>
                </div>
              )}

              {/* Phases for gestion locative */}
              {service.phases && (
                <div className="mb-8">
                  <h3 className="font-semibold text-lg mb-6">{t('public:services.aToZTitle')}</h3>
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
                              <FiCheck className={`w-3 h-3 ${colors.text} me-2 flex-shrink-0`} />
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
                <h3 className="font-semibold text-lg mb-4">{t('public:services.includedTitle')}</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {service.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <FiCheck className={`w-5 h-5 ${colors.text} me-3 mt-0.5 flex-shrink-0`} />
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
                      <span className="text-xs text-terracotta-600 font-medium">{t('public:services.photoServiceBadge')}</span>
                    </div>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {service.photoService.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-sm">
                        <FiCheck className="w-4 h-4 text-terracotta-500 me-2 flex-shrink-0" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {service.photoService.options && (
                    <div className="pt-4 border-t border-terracotta-100">
                      <p className="text-sm font-medium text-gray-700 mb-3">{t('public:services.photoServiceOptionsLabel')}</p>
                      <div className="flex flex-wrap gap-2">
                        {service.photoService.options.map((option, idx) => (
                          <span key={idx} className="inline-flex items-center px-3 py-1.5 bg-white rounded-full text-sm">
                            <span className="text-gray-700">{option.name}</span>
                            <span className="ms-2 text-terracotta-600 font-medium">{option.price}</span>
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
                  <h3 className="font-semibold text-lg mb-4">{t('public:services.notIncludedTitle')}</h3>
                  <ul className="space-y-2">
                    {service.notIncluded.map((item, idx) => (
                      <li key={idx} className="flex items-start text-gray-500">
                        <span className="w-5 h-5 me-3 text-center">-</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Options */}
              {service.options && (
                <div className="mb-8">
                  <h3 className="font-semibold text-lg mb-4">{service.optionsTitle || t('public:services.optionsDefaultTitle')}</h3>
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
                  <h3 className="font-semibold text-lg mb-6">{t('public:services.howItWorks.title')}</h3>
                  <div className="space-y-6">
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold me-4 flex-shrink-0`}>
                        1
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{t('public:services.howItWorks.step1Title')}</div>
                        <div className="text-gray-600 text-sm">{t('public:services.howItWorks.step1Text')}</div>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold me-4 flex-shrink-0`}>
                        2
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{t('public:services.howItWorks.step2Title')}</div>
                        <div className="text-gray-600 text-sm">{t('public:services.howItWorks.step2Text')}</div>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold me-4 flex-shrink-0`}>
                        3
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{t('public:services.howItWorks.step3Title')}</div>
                        <div className="text-gray-600 text-sm">{t('public:services.howItWorks.step3Text')}</div>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className={`w-8 h-8 ${colors.bg} text-white rounded-full flex items-center justify-center font-bold me-4 flex-shrink-0`}>
                        4
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{t('public:services.howItWorks.step4Title')}</div>
                        <div className="text-gray-600 text-sm">{t('public:services.howItWorks.step4Text')}</div>
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
                      <Icon className="w-6 h-6 me-2" />
                      {service.partnership ? (
                        <span className="text-sm opacity-90 flex items-center">
                          {t('public:services.partnershipPrefix')}
                          <img src={service.partnership.logo} alt={service.partnership.name} className="h-5 ms-1.5" />
                          <StayManagerWordmark light className="ms-1.5 text-base" />
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
                      {service.showCurrency && (
                        <span className="ms-2 text-lg">{DIRHAM_SYMBOL}</span>
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
                        <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
                      </Link>
                    ) : service.partnership?.registerUrl ? (
                      <a
                        href={service.partnership.registerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`btn ${colors.bgGradient || colors.bg} text-white hover:opacity-90 w-full justify-center mb-4`}
                      >
                        {t('public:services.createStayManagerAccount')}
                        <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
                      </a>
                    ) : (
                      <Link
                        to={`/contact?service=${activeService}`}
                        className={`btn ${colors.bgGradient || colors.bg} text-white ${colors.bgGradient ? 'hover:opacity-90' : colors.hover} w-full justify-center mb-4`}
                      >
                        {service.isFree ? t('public:services.requestEstimateLabel') : t('public:services.requestQuoteLabel')}
                        <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
                      </Link>
                    )}

                    <div className="text-center text-sm text-gray-500 mb-6">
                      {t('public:services.orCallUs')}
                    </div>

                    <a
                      href={`tel:${CONTACT.phoneTel}`}
                      className="flex items-center justify-center text-gray-700 hover:text-primary-600"
                    >
                      <FiPhone className="w-5 h-5 me-2" />
                      {CONTACT.phone}
                    </a>
                  </div>
                </div>

                {/* Trust badges */}
                <div className="mt-6 bg-gray-50 rounded-xl p-6">
                  <div className="text-center text-sm text-gray-500 mb-4">{t('public:services.trust.title')}</div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">500+</div>
                      <div className="text-xs text-gray-500">{t('public:services.trust.propertiesManaged')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">98%</div>
                      <div className="text-xs text-gray-500">{t('public:services.trust.satisfied')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">24h</div>
                      <div className="text-xs text-gray-500">{t('public:services.trust.responsiveness')}</div>
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
            {t('public:services.overviewTitle')}
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
                    {svc.price} {svc.showCurrency && DIRHAM_SYMBOL}
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
            {t('public:services.faqTitle')}
          </h2>

          <div className="space-y-4">
            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:services.faq.q1Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:services.faq.q1Answer')}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:services.faq.q2Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:services.faq.q2Answer')}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:services.faq.q3Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:services.faq.q3Answer', { symbol: DIRHAM_SYMBOL })}
              </p>
            </details>

            <details className="bg-white rounded-xl p-6 shadow-sm group">
              <summary className="font-medium text-gray-900 cursor-pointer flex justify-between items-center">
                {t('public:services.faq.q4Question')}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-gray-600">
                {t('public:services.faq.q4Answer')}
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
              {t('public:services.ctaTitle')}
            </h2>
            <p className="text-white/90 mb-8 max-w-2xl mx-auto">
              {t('public:services.ctaSubtitle')}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contact" className="btn bg-white text-primary-600 hover:bg-gray-100">
                <FiMail className="w-4 h-4 me-2" />
                {t('public:services.ctaContact')}
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

export default Services
