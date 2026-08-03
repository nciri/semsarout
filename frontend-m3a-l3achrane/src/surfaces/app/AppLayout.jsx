import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SidebarNav } from '../../ds/index.js'

const ITEMS = [
  { icon: 'layout-dashboard', label: 'Tableau de bord', value: 'dash' },
  { icon: 'message-circle', label: 'Messages', value: 'msg' },
]

const ROUTES = { dash: '/espace', msg: '/espace/messages' }

export default function AppLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = pathname.startsWith('/espace/messages') ? 'msg' : 'dash'

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
