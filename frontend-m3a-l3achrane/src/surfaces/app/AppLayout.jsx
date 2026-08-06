import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SidebarNav } from '../../ds/index.js'

const ITEMS = [
  { icon: 'layout-dashboard', label: 'Tableau de bord', value: 'dash' },
  { icon: 'message-circle', label: 'Messages', value: 'msg' },
  { icon: 'file-text', label: 'Candidatures reçues', value: 'inbox' },
  { icon: 'file-signature', label: 'Candidater', value: 'apply' },
  { icon: 'list-checks', label: 'Questionnaire', value: 'quiz' },
  { icon: 'credit-card', label: 'Paiements', value: 'pay' },
  { icon: 'shield', label: 'Sécurité', value: 'security' },
]

const ROUTES = {
  dash: '/espace',
  msg: '/espace/messages',
  inbox: '/espace/candidatures',
  apply: '/espace/candidature',
  quiz: '/espace/questionnaire',
  pay: '/espace/paiement',
  security: '/espace/securite',
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Route active = plus long préfixe correspondant (candidatures avant candidature avant espace).
  const active = Object.entries(ROUTES)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, route]) => pathname === route || pathname.startsWith(`${route}/`) || (route !== '/espace' && pathname.startsWith(route)))?.[0] ?? 'dash'

  useEffect(() => {
    let token = null
    try {
      token = JSON.parse(localStorage.getItem('auth-storage'))?.state?.accessToken ?? null
    } catch { /* stockage corrompu = non connecté */ }
    if (!token) navigate('/connexion', { replace: true })
  }, [navigate])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SidebarNav items={ITEMS} active={active} onSelect={(value) => navigate(ROUTES[value])} />
      <Outlet />
    </div>
  )
}
