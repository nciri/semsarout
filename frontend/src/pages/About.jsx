import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiTarget, FiUsers, FiShield, FiTrendingUp, FiArrowRight } from 'react-icons/fi'
import DirIcon from '../components/common/DirIcon'

const VALUES = [
  { icon: FiShield, key: 'transparency' },
  { icon: FiTarget, key: 'efficiency' },
  { icon: FiUsers, key: 'proximity' },
  { icon: FiTrendingUp, key: 'innovation' }
]

function About() {
  const { t } = useTranslation(['public', 'common'])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="font-display text-3xl font-bold text-gray-900 mb-4">
          {t('public:about.heroTitle')}
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          {t('public:about.heroSubtitle')}
        </p>
      </div>

      <div className="card p-8 mb-12">
        <h2 className="font-semibold text-xl mb-4">{t('public:about.missionTitle')}</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          {t('public:about.missionParagraph1')}
        </p>
        <p className="text-gray-600 leading-relaxed">
          {t('public:about.missionParagraph2')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
        {VALUES.map((value) => {
          const Icon = value.icon
          return (
            <div key={value.key} className="card p-6">
              <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-primary-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                {t(`public:about.values.${value.key}Title`)}
              </h3>
              <p className="text-sm text-gray-600">
                {t(`public:about.values.${value.key}Description`)}
              </p>
            </div>
          )
        })}
      </div>

      <div className="card p-8 text-center bg-midnight text-white">
        <h2 className="font-display text-xl font-bold mb-3">
          {t('public:about.ctaTitle')}
        </h2>
        <p className="text-ivory/70 mb-6 max-w-xl mx-auto">
          {t('public:about.ctaSubtitle')}
        </p>
        <Link to="/contact" className="btn-primary inline-flex">
          {t('public:about.ctaButton')}
          <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
        </Link>
      </div>
    </div>
  )
}

export default About
