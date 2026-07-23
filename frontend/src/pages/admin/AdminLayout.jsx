import { NavLink, Outlet } from 'react-router-dom'
import { FiGrid, FiUsers, FiActivity, FiTool } from 'react-icons/fi'

const link = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium ${
    isActive ? 'bg-midnight text-ivory' : 'text-slate-600 hover:bg-slate-100'
  }`

function AdminLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 p-4">
        <h2 className="px-4 py-3 text-lg font-bold text-midnight">Super-admin</h2>
        <nav className="space-y-1">
          <NavLink to="/admin" end className={link}><FiGrid /> Vue d'ensemble</NavLink>
          <NavLink to="/admin/comptes" className={link}><FiUsers /> Comptes</NavLink>
          <NavLink to="/admin/activite" className={link}><FiActivity /> Activité</NavLink>
          <NavLink to="/admin/artisans-partages" className={link}><FiTool /> Artisans partagés</NavLink>
        </nav>
      </aside>
      <main className="flex-1 p-8"><Outlet /></main>
    </div>
  )
}

export default AdminLayout
