import { useTranslation } from 'react-i18next'
import { Badge } from '../../ds/index.js'
import { grants } from '../../data/partnerExtras.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { versee: 'verified', enCours: 'info', enAttente: 'warning' }

export default function Grants() {
  const { t } = useTranslation(['partner', 'common'])

  const columns = [
    { key: 'program', label: t('partner:grants.table.program'), render: (row) => row.programme },
    { key: 'beneficiary', label: t('partner:grants.table.beneficiary'), render: (row) => row.beneficiaire },
    { key: 'amount', label: t('partner:grants.table.amount'), render: (row) => `${row.montant.toLocaleString('fr-MA')} Đh` },
    {
      key: 'status',
      label: t('partner:grants.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.statut]}>{t(`partner:grants.status.${row.statut}`)}</Badge>,
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:grants.kicker')} heading={t('partner:grants.heading')}>
      <PartnerCard>
        <PartnerTable columns={columns} rows={grants} emptyMessage={t('partner:grants.noResults')} />
      </PartnerCard>
    </PartnerScreen>
  )
}
