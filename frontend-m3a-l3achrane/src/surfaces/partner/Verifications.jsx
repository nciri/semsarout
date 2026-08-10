import { useTranslation } from 'react-i18next'
import { Badge } from '../../ds/index.js'
import { verificationRequests } from '../../data/partnerExtras.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { enAttente: 'warning', validee: 'verified', rejetee: 'danger' }

export default function Verifications() {
  const { t } = useTranslation(['partner', 'common'])

  const columns = [
    { key: 'student', label: t('partner:verifications.table.student'), render: (row) => row.etudiant },
    { key: 'document', label: t('partner:verifications.table.document'), render: (row) => row.document },
    {
      key: 'status',
      label: t('partner:verifications.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.statut]}>{t(`partner:verifications.status.${row.statut}`)}</Badge>,
    },
    { key: 'date', label: t('partner:verifications.table.date'), render: (row) => row.date },
  ]

  return (
    <PartnerScreen kicker={t('partner:verifications.kicker')} heading={t('partner:verifications.heading')}>
      <PartnerCard>
        <PartnerTable columns={columns} rows={verificationRequests} emptyMessage={t('partner:verifications.noResults')} />
      </PartnerCard>
    </PartnerScreen>
  )
}
