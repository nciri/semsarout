import { Link } from 'react-router-dom'
import { FiHome } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'

function NotFound() {
  const { t } = useTranslation(['public', 'common'])

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-200">404</h1>
        <h2 className="font-display text-2xl font-bold text-gray-900 mt-4">
          {t('public:notFound.title')}
        </h2>
        <p className="text-gray-600 mt-2 mb-8">
          {t('public:notFound.message')}
        </p>
        <Link to="/" className="btn-primary">
          <FiHome className="w-4 h-4 me-2" />
          {t('public:notFound.backHome')}
        </Link>
      </div>
    </div>
  )
}

export default NotFound
