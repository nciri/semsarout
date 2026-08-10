import { useTranslation } from 'react-i18next'
import { Badge, Button, Icon } from '../../ds/index.js'
import { invoices } from '../../data/partnerExtras.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { payee: 'verified', enAttente: 'warning' }

export default function Billing() {
  const { t } = useTranslation(['partner', 'common'])

  const columns = [
    { key: 'number', label: t('partner:billing.table.number'), render: (row) => row.numero },
    { key: 'period', label: t('partner:billing.table.period'), render: (row) => row.periode },
    { key: 'amount', label: t('partner:billing.table.amount'), render: (row) => `${row.montant.toLocaleString('fr-MA')} Đh` },
    {
      key: 'status',
      label: t('partner:billing.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.statut]}>{t(`partner:billing.status.${row.statut}`)}</Badge>,
    },
    {
      key: 'download',
      label: '',
      render: () => (
        <Button variant="ghost" size="sm" iconLeft="download">
          {t('partner:billing.download')}
        </Button>
      ),
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:billing.kicker')} heading={t('partner:billing.heading')}>
      {invoices.length === 0 ? (
        <PartnerCard>
          <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <Icon name="file-text" size={28} color="var(--text-muted)" />
            <div style={{ font: 'var(--fw-bold) 14.5px var(--font-display)', color: 'var(--text-heading)' }}>
              {t('partner:billing.empty.title')}
            </div>
            <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-muted)', maxWidth: 380 }}>
              {t('partner:billing.empty.hint')}
            </div>
          </div>
        </PartnerCard>
      ) : (
        <PartnerCard>
          <PartnerTable columns={columns} rows={invoices} rowKey="numero" emptyMessage={t('partner:billing.empty.title')} />
        </PartnerCard>
      )}
    </PartnerScreen>
  )
}
