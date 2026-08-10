import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SidebarNav } from '../../ds/index.js'

const ROUTES = {
  dash: '/partenaire',
  aff: '/partenaire/affilies',
  ver: '/partenaire/verifications',
  res: '/partenaire/offres',
  sub: '/partenaire/subventions',
  rep: '/partenaire/reporting',
  bill: '/partenaire/facturation',
  api: '/partenaire/api',
  help: '/espace/aide',
}

export default function PartnerLayout() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = Object.keys(ROUTES).find((key) => ROUTES[key] === pathname) ?? 'dash'

  const items = [
    { icon: 'layout-dashboard', label: t('nav.dashboard'), value: 'dash' },
    { icon: 'users', label: t('nav.affiliates'), value: 'aff' },
    { icon: 'badge-check', label: t('nav.verifications'), value: 'ver' },
    { icon: 'bookmark', label: t('nav.reservedOffers'), value: 'res' },
    { icon: 'hand-coins', label: t('nav.grants'), value: 'sub' },
    { icon: 'bar-chart-3', label: t('nav.reporting'), value: 'rep' },
    { icon: 'file-text', label: t('nav.billing'), value: 'bill' },
    { icon: 'plug', label: t('nav.apiWebhooks'), value: 'api' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SidebarNav
        items={items}
        active={active}
        onSelect={(value) => {
          if (ROUTES[value]) navigate(ROUTES[value])
        }}
      />
      <Outlet />
    </div>
  )
}
