import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCheckCircle, FiClock, FiPercent, FiXCircle } from 'react-icons/fi'
import { Alert, Kv, Rich } from '../components/kit'
import { useMoney } from '../components/kitTokens'

function Card({ icon: Icon, title, children }) {
  return (
    <section className="grid content-start gap-3.5 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="flex items-center gap-2 font-display text-[14.5px] font-bold">
        <Icon className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{title}
      </h3>
      {children}
    </section>
  )
}

/** Vente à gauche, location à droite : les deux montants ne partagent jamais une ligne de total. */
function Split({ sale, rent }) {
  const { t } = useTranslation('backoffice')
  return (
    <div className="grid grid-cols-2 gap-3">
      <Kv label={t('crm.transactions.list.summary.sale')} {...sale} />
      <Kv label={t('crm.transactions.list.summary.rent')} {...rent} />
    </div>
  )
}

export default function Summary({ data }) {
  const { t } = useTranslation('backoffice')
  const money = useMoney()
  const k = (key) => t(`crm.transactions.list.summary.${key}`)
  const { sale, rent, lost_reasons: reasons = [] } = data
  const deals = (b, type) => ({ value: b.count, sub: b.count ? money(b.amount, type) : null })
  const top = reasons.find((r) => r.reason)
  // Une commission de location est un montant ponctuel : elle s'affiche en Dh, pas en Dh/mois.
  const commission = (b) => {
    const [value, unit] = money.parts(b.commission, 'sale')
    return { value, unit, sub: b.weighted_commission ? t('crm.transactions.list.summary.weighted', { amount: money(b.weighted_commission, 'sale') }) : null }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card icon={FiClock} title={k('active')}>
        <Split sale={deals(sale.active, 'sale')} rent={deals(rent.active, 'rent')} />
      </Card>
      <Card icon={FiCheckCircle} title={k('won')}>
        <Split sale={deals(sale.won, 'sale')} rent={deals(rent.won, 'rent')} />
      </Card>
      <Card icon={FiXCircle} title={k('lost')}>
        <Split sale={deals(sale.lost, 'sale')} rent={deals(rent.lost, 'rent')} />
        {top
          ? <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey="crm.transactions.list.summary.topReason" values={{ reason: top.reason, count: top.count }} /></Alert>
          : !sale.lost.count && !rent.lost.count && <Alert tone="plain" icon={FiCheckCircle}>{k('noLoss')}</Alert>}
      </Card>
      <Card icon={FiPercent} title={k('commission')}>
        <Split sale={commission(sale.active)} rent={commission(rent.active)} />
      </Card>
    </div>
  )
}
