import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TopBar } from '../../ds/index.js'

export default function WebLayout() {
  const { t } = useTranslation(['web', 'common'])
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        onSignIn={(e) => { e.preventDefault(); navigate('/connexion') }}
        onSignUp={() => navigate('/inscription')}
      />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer style={{ background: 'var(--surface-navy-deep)', color: 'var(--text-on-navy-muted)', padding: '40px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div>{t('web:layout.footer.tagline')}</div>
          <nav style={{ display: 'flex', gap: 20 }}>
            <Link to="/recherche" style={{ color: 'inherit' }}>{t('web:layout.footer.search')}</Link>
            <Link to="/espace" style={{ color: 'inherit' }}>{t('web:layout.footer.mySpace')}</Link>
            <Link to="/partenaire" style={{ color: 'inherit' }}>{t('web:layout.footer.partners')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
