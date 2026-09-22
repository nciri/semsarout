import { useTranslation } from 'react-i18next'
import { useFormat } from '../../../utils/format'
import { useMoney } from '../components/kitTokens'

export const P = 'crm.clients.page'
export const STATUS_TONE = { active: 'good', prospect: 'gold', inactive: 'neutral' }

export function useClientLabels() {
  const { t } = useTranslation('backoffice')
  return {
    type: (k) => t(`crm.shared.clientTypes.${k}`, { defaultValue: k || '' }),
    typeLine: (c) => [t(`crm.shared.clientTypes.${c.client_type}`, { defaultValue: c.client_type || '' }), c.city].filter(Boolean).join(' · '),
  }
}

export function useBudget() {
  const money = useMoney()
  const { t } = useTranslation('backoffice')
  return (c) => (c.budget_min || c.budget_max
    ? t(`${P}.budgetRange`, { min: money(c.budget_min || 0), max: money(c.budget_max || 0) })
    : '')
}

/** Ce qui est en cours pour ce client : transaction(s), prochaine visite, sinon dernier bien visité. */
export function useCurrent() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  return (d) => {
    const bits = []
    if (d.txActive.length > 1) bits.push(t(`${P}.current.txMany`, { count: d.txActive.length }))
    else if (d.txActive.length) {
      const x = d.txActive[0]
      bits.push(`${t(`dashboard.stages.${x.stage}`, { defaultValue: x.stage })} · ${money(x.offer_price || x.asking_price || 0, x.transaction_type)}`)
    }
    if (d.upcoming.length) bits.push(t(`${P}.current.visitOn`, { date: fmtDate(d.upcoming[0].scheduled_at, { day: 'numeric', month: 'short' }) }))
    if (!bits.length && d.noOffer.length) bits.push(t(`${P}.current.visited`, { property: d.noOffer.at(-1).property_title || '' }))
    return bits.join(' · ')
  }
}

/** Titre et sous-titre d'une fiche : « Acheteur · Rabat · actif · suivi par … · venu par … ». */
export function useFicheSub() {
  const { t } = useTranslation('backoffice')
  const { typeLine } = useClientLabels()
  return (c) => [
    typeLine(c),
    t(`crm.shared.status.${c.status}`, { defaultValue: c.status || '' }).toLowerCase(),
    c.assigned_to_name ? t(`${P}.followedBy`, { name: c.assigned_to_name }) : t(`${P}.noAgent`),
    c.source ? t(`${P}.cameFrom`, { source: t(`crm.clients.form.sourceOptions.${c.source}`, { defaultValue: c.source }).toLowerCase() }) : null,
  ].filter(Boolean).join(' · ')
}
