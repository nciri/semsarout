import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFormat } from '../../utils/format'

/**
 * Bandeau d'un renouvellement impayé (`past_due`) ou d'un accès réduit (`restricted`). Le
 * paiement repasse par le parcours existant : aucun moyen de paiement n'est enregistré, le
 * système ne peut que redemander à l'agence de payer.
 */
export default function BillingStatusBanner({ subscription }) {
  const { t } = useTranslation(['dashboard'])
  const { fmtDate } = useFormat()
  const status = subscription?.status
  if (status !== 'past_due' && status !== 'restricted') return null
  const payHref = `/checkout?plan=${subscription.plan?.slug ?? ''}&billing=${subscription.billing_cycle || 'monthly'}`
  return (
    <div role="alert" className="mb-6 p-4 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm space-y-2">
      <p className="font-medium">
        {status === 'past_due'
          ? t('dashboard:billingStatus.pastDue', { date: fmtDate(subscription.grace_until) })
          : t('dashboard:billingStatus.restricted')}
      </p>
      {subscription.last_payment_failure_at && (
        <p>
          {subscription.last_payment_failure_reason
            ? t('dashboard:billingStatus.lastFailure', { reason: subscription.last_payment_failure_reason })
            : t('dashboard:billingStatus.lastFailureGeneric')}
        </p>
      )}
      <Link to={payHref} className="btn-primary inline-flex items-center min-h-[44px]">
        {t('dashboard:billingStatus.payNow')}
      </Link>
    </div>
  )
}
