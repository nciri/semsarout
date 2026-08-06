import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center' }}>
      <h1 style={{ color: 'var(--text-heading)' }}>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link to="/">{t('notFound.backHome')}</Link>
    </div>
  )
}
