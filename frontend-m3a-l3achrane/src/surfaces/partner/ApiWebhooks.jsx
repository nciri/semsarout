import { useTranslation } from 'react-i18next'
import { Badge } from '../../ds/index.js'
import { apiKeys, webhooks } from '../../data/partnerExtras.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { active: 'verified', actif: 'verified', inactif: 'neutral' }

export default function ApiWebhooks() {
  const { t } = useTranslation(['partner', 'common'])

  const keyColumns = [
    { key: 'label', label: t('partner:apiWebhooks.apiKeys.table.label'), render: (row) => row.label },
    { key: 'key', label: t('partner:apiWebhooks.apiKeys.table.key'), render: (row) => row.masked },
    { key: 'created', label: t('partner:apiWebhooks.apiKeys.table.created'), render: (row) => row.creee },
    {
      key: 'status',
      label: t('partner:apiWebhooks.apiKeys.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.statut]}>{t(`partner:apiWebhooks.status.${row.statut}`)}</Badge>,
    },
  ]

  const webhookColumns = [
    { key: 'url', label: t('partner:apiWebhooks.webhooks.table.url'), render: (row) => row.url },
    { key: 'events', label: t('partner:apiWebhooks.webhooks.table.events'), render: (row) => row.evenements.join(', ') },
    {
      key: 'status',
      label: t('partner:apiWebhooks.webhooks.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.statut]}>{t(`partner:apiWebhooks.status.${row.statut}`)}</Badge>,
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:apiWebhooks.kicker')} heading={t('partner:apiWebhooks.heading')}>
      <PartnerCard title={t('partner:apiWebhooks.apiKeys.title')}>
        <PartnerTable columns={keyColumns} rows={apiKeys} emptyMessage="" />
      </PartnerCard>
      <PartnerCard title={t('partner:apiWebhooks.webhooks.title')}>
        <PartnerTable columns={webhookColumns} rows={webhooks} emptyMessage="" />
      </PartnerCard>
    </PartnerScreen>
  )
}
