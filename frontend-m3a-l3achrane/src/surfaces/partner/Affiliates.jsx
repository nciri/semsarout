import { useTranslation } from 'react-i18next'
import { Badge } from '../../ds/index.js'
import { affiliates } from '../../data/partnerExtras.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { actif: 'verified', suspendu: 'danger', enAttente: 'warning' }

export default function Affiliates() {
  const { t } = useTranslation(['partner', 'common'])

  const columns = [
    { key: 'name', label: t('partner:affiliates.table.name'), render: (row) => row.nom },
    { key: 'city', label: t('partner:affiliates.table.city'), render: (row) => row.ville },
    { key: 'students', label: t('partner:affiliates.table.students'), render: (row) => row.logementsEtudiants },
    {
      key: 'status',
      label: t('partner:affiliates.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.statut]}>{t(`partner:affiliates.status.${row.statut}`)}</Badge>,
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:affiliates.kicker')} heading={t('partner:affiliates.heading')}>
      <PartnerCard>
        <PartnerTable columns={columns} rows={affiliates} emptyMessage={t('partner:affiliates.noResults')} />
      </PartnerCard>
    </PartnerScreen>
  )
}
