import { useState } from 'react'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'

const TABS = [
  { to: '', label: 'Finance', end: true },
  { to: 'marche', label: 'Marché' },
  { to: 'pipeline', label: 'Pipeline' },
  { to: 'equipe', label: 'Équipe' },
]
const RANGES = [['30d', '30 j'], ['90d', '90 j'], ['12m', '12 mois'], ['ytd', 'Année']]

function AnalyticsLayout() {
  const [range, setRange] = useState('12m')
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Analyses</h1>
        <select value={range} onChange={(e) => setRange(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <NavLink key={t.label} to={t.to} end={t.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ range }} />
    </div>
  )
}
export const useRange = () => useOutletContext().range
export default AnalyticsLayout
