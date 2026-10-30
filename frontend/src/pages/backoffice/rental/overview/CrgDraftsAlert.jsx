import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle } from 'react-icons/fi'
import { rentalService } from '../../../../services/rentalService'
import { Alert, Chip } from '../../components/kit'
import { DraftAge } from '../parts'
import { useRentalFormat } from '../hooks'

/** Un CRG en attente ne bloque rien mais ne doit dormir dans l'ombre : bandeau rouge, du plus ancien au plus récent.
 *
 * Les validés-jamais-partis y figurent aussi : sans eux, un relevé bloqué à l'envoi (propriétaire
 * sans e-mail valide, dépense reprise par le mois suivant) n'apparaissait sur aucun écran. */
function CrgDraftsAlert() {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const { data } = useQuery('rental-crg-drafts', () => rentalService.listCrgDrafts(), { refetchInterval: 60000 })
  const drafts = data?.drafts || []
  if (!drafts.length) return null
  return (
    <Alert tone="crit" icon={FiAlertTriangle}>
      <b className="font-semibold text-redcard-500">{t('rental.overview.crgDrafts.title', { count: drafts.length })}</b>
      <span className="block">{t('rental.overview.crgDrafts.hint')}</span>
      <ul className="mt-1.5 grid gap-1">
        {drafts.map((d) => (
          <li key={d.crg_id} className="flex flex-wrap items-center gap-2">
            <Link to={`/backoffice/gestion-locative/mandats/${d.mandate_id}`} className="font-semibold underline">
              {t('rental.overview.crgDrafts.item', { reference: d.mandate_reference || `#${d.mandate_id}`, period: d.period_label })}
            </Link>
            <span className="tabular-nums">{t('rental.overview.crgDrafts.net', { amount: f.dh(d.net) })}</span>
            {d.status === 'validated' && <Chip tone="crit">{t('rental.overview.crgDrafts.stuck')}</Chip>}
            <DraftAge days={d.waiting_days} />
          </li>
        ))}
      </ul>
    </Alert>
  )
}
export default CrgDraftsAlert
