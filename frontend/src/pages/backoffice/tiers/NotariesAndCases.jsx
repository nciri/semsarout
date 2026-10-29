import { useTranslation } from 'react-i18next'
import NotariesDirectory from '../legal/NotariesDirectory'
import LegalCasesList from '../legal/LegalCasesList'

/** Les notaires et les dossiers qu'on leur confie : un seul écran, deux sections. */
function NotariesAndCases() {
  const { t } = useTranslation(['backoffice'])
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:legal.layout.tabs.notaries')}</h2>
        <NotariesDirectory />
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:legal.layout.tabs.cases')}</h2>
        <LegalCasesList />
      </section>
    </div>
  )
}
export default NotariesAndCases
