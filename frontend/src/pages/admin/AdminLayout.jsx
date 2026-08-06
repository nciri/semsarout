import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiGrid, FiUsers, FiActivity, FiTool, FiShoppingBag, FiPackage } from 'react-icons/fi'

const link = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium ${
    isActive ? 'bg-midnight text-ivory' : 'text-slate-600 hover:bg-slate-100'
  }`

function AdminLayout() {
  const { t } = useTranslation(['admin', 'common'])
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 shrink-0 bg-white border-e border-slate-200 p-4">
        <h2 className="px-4 py-3 text-lg font-bold text-midnight">{t('admin:shared.title')}</h2>
        <nav className="space-y-1">
          <NavLink to="/admin" end className={link}><FiGrid /> {t('admin:shared.nav.overview')}</NavLink>
          <NavLink to="/admin/comptes" className={link}><FiUsers /> {t('admin:shared.nav.accounts')}</NavLink>
          <NavLink to="/admin/activite" className={link}><FiActivity /> {t('admin:shared.nav.activity')}</NavLink>
          <NavLink to="/admin/artisans-partages" className={link}><FiTool /> {t('admin:shared.nav.sharedArtisans')}</NavLink>
          <NavLink to="/admin/produits" className={link}><FiShoppingBag /> {t('admin:shared.nav.products')}</NavLink>
          <NavLink to="/admin/commandes" className={link}><FiPackage /> {t('admin:shared.nav.orders')}</NavLink>
        </nav>
      </aside>
      <main className="flex-1 p-8"><Outlet /></main>
    </div>
  )
}

export default AdminLayout
