import { useState } from 'react'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../../../services/api'
import SearchableSelect from '../../../components/common/SearchableSelect'

const TABS = [
  { to: '', key: 'overview', end: true },
  { to: 'finance', key: 'finance' },
  { to: 'marche', key: 'market' },
  { to: 'pipeline', key: 'pipeline' },
  { to: 'equipe', key: 'team' },
]
const RANGES = ['30d', '90d', '12m', 'ytd']
const TX_TYPES = [['', 'all'], ['sale', 'sale'], ['rent', 'rent']]

function AnalyticsLayout() {
  const { t } = useTranslation(['backoffice'])
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
    value: c.city, label: c.city, description: t('backoffice:analytics.shared.propertyCount', { count: c.count }),
  }))

  const selectCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white'

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('backoffice:analytics.layout.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.range} onChange={(e) => set('range')(e.target.value)} className={selectCls}>
            {RANGES.map((v) => <option key={v} value={v}>{t(`backoffice:analytics.layout.ranges.${v}`)}</option>)}
          </select>
          <select value={filters.type} onChange={(e) => set('type')(e.target.value)} className={selectCls}>
            {TX_TYPES.map(([v, k]) => <option key={v} value={v}>{t(`backoffice:analytics.layout.txTypes.${k}`)}</option>)}
          </select>
          <SearchableSelect
            value={filters.agent}
            onChange={set('agent')}
            options={agentOptions}
            placeholder={t('backoffice:analytics.layout.agentAll')}
            searchPlaceholder={t('backoffice:analytics.layout.agentSearch')}
            clearable
            className="min-w-[11rem]"
          />
          <SearchableSelect
            value={filters.city}
            onChange={set('city')}
            options={cityOptions}
            placeholder={t('backoffice:analytics.layout.cityAll')}
            searchPlaceholder={t('backoffice:analytics.layout.citySearch')}
            clearable
            className="min-w-[11rem]"
          />
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">{t('backoffice:analytics.layout.cityNote')}</p>
      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500'}`}>
            {t(`backoffice:analytics.layout.tabs.${tab.key}`)}
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
