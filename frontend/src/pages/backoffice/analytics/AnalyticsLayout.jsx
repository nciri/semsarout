import { useState } from 'react'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'
import { useQuery } from 'react-query'
import api from '../../../services/api'
import SearchableSelect from '../../../components/common/SearchableSelect'

const TABS = [
  { to: '', label: "Vue d'ensemble", end: true },
  { to: 'finance', label: 'Finance' },
  { to: 'marche', label: 'Marché' },
  { to: 'pipeline', label: 'Pipeline' },
  { to: 'equipe', label: 'Équipe' },
]
const RANGES = [['30d', '30 j'], ['90d', '90 j'], ['12m', '12 mois'], ['ytd', 'Année']]
const TX_TYPES = [['', 'Tous types'], ['sale', 'Vente'], ['rent', 'Location']]

function AnalyticsLayout() {
  const [filters, setFilters] = useState({ range: '12m', type: '', agent: '', city: '' })
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }))

  const { data: agentsData } = useQuery('bo-agents', async () => {
    try { return (await api.get('/backoffice/users?role=agent')).data } catch { return { users: [] } }
  })
  const { data: citiesData } = useQuery('stats-cities', async () => {
    try { return (await api.get('/backoffice/stats/properties-by-city')).data } catch { return { cities: [] } }
  })

  const agentOptions = (agentsData?.users || []).map((a) => ({
    value: String(a.id), label: `${a.first_name} ${a.last_name}`, description: a.email,
  }))
  const cityOptions = (citiesData?.cities || []).map((c) => ({
    value: c.city, label: c.city, description: `${c.count} bien${c.count > 1 ? 's' : ''}`,
  }))

  const selectCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white'

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Analyses</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.range} onChange={(e) => set('range')(e.target.value)} className={selectCls}>
            {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filters.type} onChange={(e) => set('type')(e.target.value)} className={selectCls}>
            {TX_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <SearchableSelect
            value={filters.agent}
            onChange={set('agent')}
            options={agentOptions}
            placeholder="Tous les agents"
            searchPlaceholder="Rechercher un agent…"
            clearable
            className="min-w-[11rem]"
          />
          <SearchableSelect
            value={filters.city}
            onChange={set('city')}
            options={cityOptions}
            placeholder="Toutes les villes"
            searchPlaceholder="Rechercher une ville…"
            clearable
            className="min-w-[11rem]"
          />
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">La ville ne s'applique qu'à l'onglet Marché (biens).</p>
      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <NavLink key={t.label} to={t.to} end={t.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ filters }} />
    </div>
  )
}

export const useFilters = () => useOutletContext().filters
// Rétro-compat : les pages n'utilisant que la période.
export const useRange = () => useOutletContext().filters.range
export default AnalyticsLayout
