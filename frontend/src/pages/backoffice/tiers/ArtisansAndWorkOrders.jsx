import { useTranslation } from 'react-i18next'
import ArtisansDirectory from '../artisans/ArtisansDirectory'
import WorkOrdersList from '../artisans/WorkOrdersList'

/** L'annuaire des artisans et les interventions qu'on leur confie : un seul écran. */
function ArtisansAndWorkOrders() {
  const { t } = useTranslation(['backoffice'])
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:artisans.layout.tabs.directory')}</h2>
        <ArtisansDirectory />
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:artisans.layout.tabs.interventions')}</h2>
        <WorkOrdersList />
      </section>
    </div>
  )
}
export default ArtisansAndWorkOrders
