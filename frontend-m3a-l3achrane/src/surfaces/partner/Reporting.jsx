import { useTranslation } from 'react-i18next'
import { reportingRows } from '../../data/partnerExtras.js'
import { PartnerCard, PartnerKpi, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

export default function Reporting() {
  const { t } = useTranslation(['partner', 'common'])

  const totalVerifications = reportingRows.reduce((sum, r) => sum + r.verifications, 0)
  const totalGrantsPaid = reportingRows.reduce((sum, r) => sum + r.subventionsVersees, 0)
  const totalAmount = reportingRows.reduce((sum, r) => sum + r.montantTotal, 0)

  const columns = [
    { key: 'period', label: t('partner:reporting.table.period'), render: (row) => row.periode },
    { key: 'verifications', label: t('partner:reporting.table.verifications'), render: (row) => row.verifications },
    { key: 'grantsPaid', label: t('partner:reporting.table.grantsPaid'), render: (row) => row.subventionsVersees },
    { key: 'totalAmount', label: t('partner:reporting.table.totalAmount'), render: (row) => `${row.montantTotal.toLocaleString('fr-MA')} Đh` },
  ]

  return (
    <PartnerScreen kicker={t('partner:reporting.kicker')} heading={t('partner:reporting.heading')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <PartnerKpi label={t('partner:reporting.kpis.totalVerifications')} value={totalVerifications} />
        <PartnerKpi label={t('partner:reporting.kpis.totalGrantsPaid')} value={totalGrantsPaid} />
        <PartnerKpi label={t('partner:reporting.kpis.totalAmount')} value={`${totalAmount.toLocaleString('fr-MA')} Đh`} />
      </div>
      <PartnerCard title={t('partner:reporting.tableTitle')}>
        <PartnerTable columns={columns} rows={reportingRows} rowKey="periode" emptyMessage={t('partner:reporting.noResults')} />
      </PartnerCard>
    </PartnerScreen>
  )
}
