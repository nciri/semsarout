import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiArrowRight, FiCheck, FiDollarSign,
  FiShield, FiTrendingUp, FiUsers, FiZap, FiX
} from 'react-icons/fi'
import AdvancedSearch from '../components/search/AdvancedSearch'
import PropertyCard from '../components/common/PropertyCard'
import DirIcon from '../components/common/DirIcon'
import { propertyService } from '../services/propertyService'
import { DIRHAM_SYMBOL, formatPrice } from '../utils/currency'

function Home() {
  const { t } = useTranslation(['public', 'common'])
  const { data: featuredData } = useQuery(
    'featured-properties',
    () => propertyService.getProperties({ per_page: 6, sort: 'newest' })
  )

  const bullets = [t('public:home.bullet1'), t('public:home.bullet2'), t('public:home.bullet3')]
  const stats = [
    ['0%', t('public:home.statCommission')],
    [formatPrice(4900), t('public:home.statFlatFee')],
    ['100%', t('public:home.statTransparent')],
    ['24h', t('public:home.statPublication')]
  ]
  const problems = [
    {
      t: t('public:home.problem1Title'),
      p: t('public:home.problem1Text', { currency: DIRHAM_SYMBOL, amount: formatPrice(100000) }),
      s: t('public:home.problem1Solution', { amount: formatPrice(4900) })
    },
    {
      t: t('public:home.problem2Title'),
      p: t('public:home.problem2Text'),
      s: t('public:home.problem2Solution')
    },
    {
      t: t('public:home.problem3Title'),
      p: t('public:home.problem3Text'),
      s: t('public:home.problem3Solution')
    }
  ]
  const whyItems = [
    [FiDollarSign, 'text-primary-600', 'bg-primary-50', t('public:home.whyFlatFeeTitle'), t('public:home.whyFlatFeeText')],
    [FiShield, 'text-emerald-500', 'bg-emerald-50', t('public:home.whyTransparencyTitle'), t('public:home.whyTransparencyText')],
    [FiTrendingUp, 'text-redcard-500', 'bg-redcard-50', t('public:home.whyEfficiencyTitle'), t('public:home.whyEfficiencyText')],
    [FiUsers, 'text-blue-600', 'bg-blue-50', t('public:home.whyAccessibilityTitle'), t('public:home.whyAccessibilityText')]
  ]

  return (
    <div>
      {/* Hero Section — midnight avec glows or/émeraude (design system) */}
      <section
        className="relative text-ivory overflow-hidden"
        style={{
          background:
            'radial-gradient(1100px 520px at 12% -20%, rgba(214,168,95,.24), transparent 55%), radial-gradient(820px 420px at 100% -10%, rgba(15,118,110,.20), transparent 50%), #0B1220'
        }}
      >
        {/* Skyline Maroc 2030 côté droit, fondue dans le fond à gauche pour ne pas gêner le texte */}
        <div
          className="hidden lg:block absolute inset-0 opacity-[0.4] pointer-events-none"
          style={{
            backgroundImage: 'url(/hero-bg.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 20%',
            backgroundRepeat: 'no-repeat',
            maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,.6) 45%, rgba(0,0,0,0) 72%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,.6) 45%, rgba(0,0,0,0) 72%)'
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-[70px] pb-20 lg:pb-[110px]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-[14px] py-[7px] bg-white/[.08] border border-white/[.14] rounded-full text-[13px] font-semibold mb-6">
              <FiZap className="w-4 h-4 text-primary-400 fill-primary-400" />
              <span>{t('public:home.badge')}</span>
            </div>

            <h1 className="font-display text-4xl lg:text-[64px] font-extrabold mb-6 leading-[1.02] tracking-[-.03em] text-ivory">
              {t('public:home.heroTitlePart1')}<br />
              {t('public:home.heroTitlePart2')} <span className="text-[#EA4A4A]">{t('public:home.heroTitleHighlight')}</span>
            </h1>

            <p className="text-lg lg:text-[19px] text-ivory/[.82] mb-7 leading-relaxed max-w-2xl">
              {t('public:home.heroSubtitle')}
            </p>

            <div className="flex flex-wrap gap-6 mb-10">
              {bullets.map((bt) => (
                <div key={bt} className="flex items-center gap-2 text-sm text-ivory/90">
                  <span className="inline-flex w-5 h-5 rounded-full bg-emerald-500 items-center justify-center flex-shrink-0">
                    <FiCheck className="w-3 h-3 text-white" />
                  </span>
                  <span>{bt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Search Form */}
          <div className="max-w-5xl">
            <AdvancedSearch />
          </div>

          {/* Stats */}
          <div className="mt-11 flex flex-wrap gap-x-14 gap-y-6">
            {stats.map(([n, l]) => (
              <div key={l}>
                <div className="font-display font-extrabold text-[34px] text-primary-400">{n}</div>
                <div className="text-[13px] text-ivory/70">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
              {t('public:home.heroTitle')}
            </h2>
            <p className="text-xl text-gray-600">
              {t('public:home.valuePropSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {problems.map((c) => (
              <div key={c.t} className="bg-white border border-slate-200 rounded-ds-lg p-7 shadow-ds-md">
                <span className="inline-flex w-11 h-11 rounded-xl bg-redcard-50 items-center justify-center mb-[18px]">
                  <FiX className="w-[22px] h-[22px] text-redcard-500" strokeWidth={2.2} />
                </span>
                <h3 className="font-display font-semibold text-[19px] mb-2.5 text-midnight">{c.t}</h3>
                <p className="text-[15px] text-slate-500 mb-4 leading-relaxed">{c.p}</p>
                <div className="pt-3.5 border-t border-slate-200 flex items-center gap-2 text-emerald-500 font-semibold text-sm">
                  <FiCheck className="w-4 h-4" />
                  {c.s}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Services */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              {t('public:home.servicesTitle')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('public:home.servicesSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Service 1 - Vente */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="inline-block px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium mb-4">
                    {t('public:home.saleBadge')}
                  </span>
                  <h3 className="font-display text-2xl font-bold text-gray-900">
                    {t('public:home.saleTitle')}
                  </h3>
                </div>
                <div className="text-end">
                  <div className="text-3xl font-bold text-primary-600">{formatPrice(4900)}</div>
                  <div className="text-sm text-gray-500">{t('public:home.saleFlatFeeNote')}</div>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.saleFeature1')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.saleFeature2')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.saleFeature3')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.saleFeature4')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.saleFeature5')}</span>
                </li>
              </ul>

              <Link to="/nos-services/vente" className="btn-primary w-full justify-center">
                {t('public:home.sellCta')}
                <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
              </Link>
            </div>

            {/* Service 2 - Gestion Locative */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
                    {t('public:home.rentalBadge')}
                  </span>
                  <h3 className="font-display text-2xl font-bold text-gray-900">
                    {t('public:home.rentalTitle')}
                  </h3>
                </div>
                <div className="text-end">
                  <div className="text-3xl font-bold text-blue-600">{t('public:home.rentalPriceFrom')}</div>
                  <div className="text-sm text-gray-500">{t('public:home.rentalPriceNote')}</div>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.rentalFeature1')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.rentalFeature2')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.rentalFeature3')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.rentalFeature4')}</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 me-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">{t('public:home.rentalFeature5')}</span>
                </li>
              </ul>

              <Link to="/nos-services/gestion-locative" className="btn bg-blue-600 text-white hover:bg-blue-700 w-full justify-center">
                {t('public:home.manageCta')}
                <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
              </Link>
            </div>
          </div>

          {/* Comparison — panneau midnight (design system) */}
          <div className="mt-16 rounded-ds-xl p-10 lg:p-12" style={{ background: 'linear-gradient(120deg, #0B1220, #16233b)' }}>
            <h3 className="font-display text-[30px] font-bold mb-10 text-center text-ivory">
              {t('public:home.compareTitle')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-ivory/60 mb-2">{t('public:home.compareAgencyLabel')}</div>
                <div className="font-display text-[38px] font-extrabold text-[#EA6A6A]">{formatPrice(30000)}</div>
                <div className="text-[13px] text-ivory/50">{t('public:home.compareAgencyNote')}</div>
              </div>
              <div className="text-center">
                <div className="mb-2">
                  <span className="inline-flex items-baseline gap-[5px] font-display font-extrabold text-[22px] tracking-tight text-primary-400">
                    <span>Semsar</span>
                    <span className="inline-flex items-center text-white text-[18px] px-[9px] py-[2px] rounded-[5px] shadow-red -rotate-[4deg]" style={{ background: 'linear-gradient(150deg, rgb(193, 18, 31) 0%, rgb(135, 11, 21) 100%)' }}>Out</span>
                  </span>
                </div>
                <div className="font-display text-[46px] font-extrabold text-primary-400">{formatPrice(4900)}</div>
                <div className="text-[13px] text-ivory/50">{t('public:home.compareUsFlatFeeNote')}</div>
              </div>
              <div className="text-center">
                <div className="text-ivory/60 mb-2">{t('public:home.compareSavingsLabel')}</div>
                <div className="font-display text-[38px] font-extrabold text-[#3FC79A]">{formatPrice(25100)}</div>
                <div className="text-[13px] text-ivory/50">{t('public:home.compareSavingsNote')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex justify-between items-end mb-7">
          <div>
            <h2 className="font-display text-[32px] font-bold text-midnight mb-1">{t('public:home.featuredTitle')}</h2>
            <p className="text-slate-500">{t('public:home.featuredSubtitle')}</p>
          </div>
          <Link to="/annonces" className="text-emerald-500 hover:text-emerald-600 flex items-center font-semibold text-[15px]">
            {t('public:home.seeAll')} <DirIcon icon={FiArrowRight} className="ms-1.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredData?.properties?.map(property => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-white py-[88px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-[32px] font-bold text-midnight mb-12 text-center">
            {t('public:home.whyTitle')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-7">
            {whyItems.map(([IconCmp, color, bg, wt, wd]) => (
              <div key={wt} className="text-center">
                <div className={`w-16 h-16 ${bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <IconCmp className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2 text-midnight">{wt}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{wd}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA for Agencies */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="rounded-ds-xl p-8 lg:p-11 text-white" style={{ background: 'linear-gradient(135deg,#0F766E 0%,#14B8A6 100%)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold mb-4">
                {t('public:home.agencyCtaTitle')}
              </h2>
              <p className="text-white/90 mb-6">
                {t('public:home.agencyCtaText')}
              </p>
              <ul className="space-y-2 mb-8">
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 me-2" />
                  {t('public:home.agencyFeature1')}
                </li>
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 me-2" />
                  {t('public:home.agencyFeature2')}
                </li>
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 me-2" />
                  {t('public:home.agencyFeature3')}
                </li>
              </ul>
              <Link to="/dashboard/agence" className="btn bg-white text-midnight hover:bg-slate-50 border-[1.5px] border-transparent">
                {t('public:home.agencyCtaButton')}
                <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
              </Link>
            </div>
            <div className="hidden lg:block">
              <img
                src="/agency-dashboard.svg"
                alt={t('public:home.agencyDashboardAlt')}
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
