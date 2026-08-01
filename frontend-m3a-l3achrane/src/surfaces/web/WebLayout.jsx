import { Outlet, Link } from 'react-router-dom'
import { TopBar } from '../../ds/index.js'

export default function WebLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer style={{ background: 'var(--surface-navy-deep)', color: 'var(--text-on-navy-muted)', padding: '40px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div>M3a-L3chrane — Colocation vérifiée au Maroc</div>
          <nav style={{ display: 'flex', gap: 20 }}>
            <Link to="/recherche" style={{ color: 'inherit' }}>Rechercher</Link>
            <Link to="/espace" style={{ color: 'inherit' }}>Mon espace</Link>
            <Link to="/partenaire" style={{ color: 'inherit' }}>Partenaires</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
