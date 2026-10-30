import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchInput, Toolbar } from '../../../components/backoffice/ui'
import NotariesDirectory from '../legal/NotariesDirectory'
import LegalCasesList from '../legal/LegalCasesList'

/**
 * Les notaires et les dossiers qu'on leur confie : un seul écran, deux sections, et une
 * seule recherche — chercher un notaire et chercher ses dossiers, c'est le même geste.
 */
function NotariesAndCases() {
  const { t } = useTranslation(['backoffice'])
  const [q, setQ] = useState('')
  return (
    <div className="space-y-8">
      <Toolbar>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t('backoffice:tiers.filters.searchLegal')} />
      </Toolbar>

      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:legal.layout.tabs.notaries')}</h2>
        <NotariesDirectory q={q} />
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-[15px] font-bold">{t('backoffice:legal.layout.tabs.cases')}</h2>
        <LegalCasesList q={q} />
      </section>
    </div>
  )
}
export default NotariesAndCases
