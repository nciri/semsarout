import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SidebarNav } from '../../ds/index.js'
import api from '../../services/api.js'
import { getCurrentProfile } from '../../services/index.js'

// Garde d'auth : présence du drapeau lisible `m3a_authed` (posé par le BFF, JAMAIS un
// jeton) — le jeton d'accès réel reste en cookie httpOnly, invisible ici.
function hasAuthedCookie() {
  return /(?:^|;\s*)m3a_authed=1(?:;|$)/.test(document.cookie)
}

const ROUTES = {
  home: '/',
  search: '/recherche',
  dash: '/espace',
  msg: '/espace/messages',
  inbox: '/espace/candidatures',
  roommate: '/espace/validation',
  quiz: '/espace/questionnaire',
  pay: '/espace/paiement',
  security: '/espace/securite',
}

export default function AppLayout() {
  const { t } = useTranslation('common')
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [userName, setUserName] = useState(null)
  // Route active = plus long préfixe correspondant (candidatures avant candidature avant espace).
  const active = Object.entries(ROUTES)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, route]) => pathname === route || pathname.startsWith(`${route}/`) || (route !== '/espace' && pathname.startsWith(route)))?.[0] ?? 'dash'

  const items = [
    { icon: 'home', label: t('nav.home'), value: 'home' },
    { icon: 'search', label: t('nav.search'), value: 'search' },
    { icon: 'layout-dashboard', label: t('nav.dashboard'), value: 'dash' },
    { icon: 'message-circle', label: t('nav.messages'), value: 'msg' },
    { icon: 'file-text', label: t('nav.inbox'), value: 'inbox' },
    { icon: 'user-check', label: t('nav.roommateValidation'), value: 'roommate' },
    { icon: 'list-checks', label: t('nav.quiz'), value: 'quiz' },
    { icon: 'credit-card', label: t('nav.payments'), value: 'pay' },
    { icon: 'shield', label: t('nav.security'), value: 'security' },
  ]

  useEffect(() => {
    if (!hasAuthedCookie()) navigate('/connexion', { replace: true })
  }, [navigate])

  useEffect(() => {
    getCurrentProfile()
      .then((profile) => setUserName(profile.prenom || null))
      .catch(() => {})
  }, [])

  const handleLogout = () => {
    api.post('/auth/logout').finally(() => navigate('/connexion'))
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SidebarNav
        items={items}
        active={active}
        onSelect={(value) => navigate(ROUTES[value])}
        userName={userName || t('nav.myAccount')}
        onLogout={handleLogout}
      />
      <Outlet />
    </div>
  )
}
