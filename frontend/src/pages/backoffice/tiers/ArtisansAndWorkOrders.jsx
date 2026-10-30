import { useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { artisanService } from '../../../services/artisanService'
import { SearchInput, Select, Toolbar } from '../../../components/backoffice/ui'
import ArtisansDirectory from '../artisans/ArtisansDirectory'
import WorkOrdersList from '../artisans/WorkOrdersList'

/**
 * L'annuaire des artisans et les interventions qu'on leur confie : un seul écran, et un seul
 * filtre. Chercher un plombier ou chercher ce qu'on lui a confié part du même mot, donc la
 * barre vaut pour les deux sections.
 */
function ArtisansAndWorkOrders() {
  const { t } = useTranslation(['backoffice'])
  const [filter, setFilter] = useState({ trade: '', city: '', q: '' })
  // Même clé que les deux sections : react-query partage le cache, aucune requête de plus.
  const { data } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const trades = data?.trades || []
  const set = (k) => (e) => setFilter((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-8">
      <Toolbar>
        <Select value={filter.trade} onChange={set('trade')}>
          <option value="">{t('backoffice:artisans.directory.filters.allTrades')}</option>
          {trades.map((tr) => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
        </Select>
        <input value={filter.city} onChange={set('city')}
          placeholder={t('backoffice:artisans.directory.filters.cityPlaceholder')}
          className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        <SearchInput value={filter.q} onChange={set('q')}
          placeholder={t('backoffice:tiers.filters.searchArtisans')} />
      </Toolbar>

      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:artisans.layout.tabs.directory')}</h2>
        <ArtisansDirectory filter={filter} />
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:artisans.layout.tabs.interventions')}</h2>
        <WorkOrdersList filter={filter} />
      </section>
    </div>
  )
}
export default ArtisansAndWorkOrders
