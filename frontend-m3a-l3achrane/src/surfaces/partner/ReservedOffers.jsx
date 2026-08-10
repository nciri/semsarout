import { useTranslation } from 'react-i18next'
import { Badge } from '../../ds/index.js'
import { reservedOffers } from '../../data/partnerExtras.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { active: 'verified', expiree: 'neutral', enAttente: 'warning' }

export default function ReservedOffers() {
  const { t } = useTranslation(['partner', 'common'])

  const columns = [
    { key: 'listing', label: t('partner:reservedOffers.table.listing'), render: (row) => row.annonce },
    { key: 'reservedFor', label: t('partner:reservedOffers.table.reservedFor'), render: (row) => row.reserveePour },
    { key: 'period', label: t('partner:reservedOffers.table.period'), render: (row) => row.periode },
    {
      key: 'status',
      label: t('partner:reservedOffers.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.statut]}>{t(`partner:reservedOffers.status.${row.statut}`)}</Badge>,
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:reservedOffers.kicker')} heading={t('partner:reservedOffers.heading')}>
      <PartnerCard>
        <PartnerTable columns={columns} rows={reservedOffers} emptyMessage={t('partner:reservedOffers.noResults')} />
      </PartnerCard>
    </PartnerScreen>
  )
}
