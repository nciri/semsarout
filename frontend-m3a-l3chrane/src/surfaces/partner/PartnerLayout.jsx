import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SidebarNav } from '../../ds/index.js'

const ITEMS = [
  { icon: 'layout-dashboard', label: 'Tableau de bord', value: 'dash' },
  { icon: 'users', label: 'Affiliés', value: 'aff' },
  { icon: 'badge-check', label: 'Vérifications', value: 'ver' },
  { icon: 'bookmark', label: 'Offres réservées', value: 'res' },
  { icon: 'hand-coins', label: 'Subventions', value: 'sub' },
  { icon: 'bar-chart-3', label: 'Reporting', value: 'rep' },
  { icon: 'file-text', label: 'Facturation', value: 'bill' },
  { icon: 'plug', label: 'API & webhooks', value: 'api' },
]

const ROUTES = { dash: '/partenaire' }

export default function PartnerLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = pathname.startsWith('/partenaire') ? 'dash' : 'dash'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SidebarNav
        items={ITEMS}
        active={active}
        onSelect={(value) => {
          if (ROUTES[value]) navigate(ROUTES[value])
        }}
      />
      <Outlet />
    </div>
  )
}
