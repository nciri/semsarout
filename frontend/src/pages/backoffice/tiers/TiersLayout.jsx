import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/backoffice/ui'

/**
 * Les tiers de l'agence tenaient deux pages et quatre onglets : notaires / dossiers d'un
 * côté, annuaire artisans / interventions de l'autre. Or un annuaire et ce qu'on y confie
 * se lisent ensemble : chaque métier n'a plus qu'un écran, et les deux métiers deviennent
 * les deux onglets de cette page.
 */
const TABS = [
  { to: '', key: 'legal', end: true },
  { to: 'artisans', key: 'artisans' },
]

const TAB = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors'

function TiersLayout() {
  const { t } = useTranslation(['backoffice'])
  return (
    <div className="space-y-6">
      <PageHeader title={t('backoffice:tiers.title')} subtitle={t('backoffice:tiers.subtitle')} />
      <nav aria-label={t('backoffice:tiers.navLabel')} className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.end}
            className={({ isActive }) => `${TAB} ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t(`backoffice:tiers.tabs.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
export default TiersLayout
