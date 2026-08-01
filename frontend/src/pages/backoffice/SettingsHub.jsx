import { useState } from 'react'
import { FiBriefcase, FiUser } from 'react-icons/fi'
import BackofficeSettings from './Settings'
import DashboardSettings from '../dashboard/Settings'

const TABS = [
  { id: 'agence', label: 'Agence', icon: FiBriefcase },
  { id: 'compte', label: 'Mon compte', icon: FiUser },
]

// Regroupe en un seul endroit (back-office) les réglages de l'agence
// et ceux du compte personnel, pour lever la redondance avec l'espace site.
export default function SettingsHub() {
  const [tab, setTab] = useState('agence')
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </nav>
      {tab === 'agence' ? <BackofficeSettings /> : <DashboardSettings />}
    </div>
  )
}
