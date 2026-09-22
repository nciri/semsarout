import { useTranslation } from 'react-i18next'
import { useFormat } from '../../../utils/format'
import { useMoney } from '../components/kitTokens'

export const P = 'crm.pipeline.pipeline'

/** Titre et texte d'un constat servi par l'API (code + paramètres), dans la langue courante. */
export function useFlagText(type) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtDate } = useFormat()
  const money = useMoney()
  return (f) => {
    const p = f.params || {}
    const v = {
      ...p,
      count: p.days,
      date: p.date ? fmtDate(`${p.date}T12:00:00`, { day: 'numeric', month: 'long' }) : t('flags.noDate'),
      amount: p.amount != null ? money(p.amount, type) : '',
      // En milieu de phrase : « en négociation » (sans effet sur l'arabe).
      stage: p.stage ? t(`stages.${p.stage}`, { defaultValue: p.stage }).toLocaleLowerCase() : '',
      reason: p.reason || t('flags.noReason'),
      status: p.status ? t(`flags.status.${p.status}`, { defaultValue: p.status }) : '',
    }
    if (!t(`flags.${f.code}.title`, { ...v, defaultValue: '' })) return { title: t('flags.unknown'), text: '' }
    const context = f.code === 'duplicate' ? (p.status === 'won' ? 'won' : 'active') : undefined
    return { title: t(`flags.${f.code}.title`, v), text: t(`flags.${f.code}.text`, { ...v, context }) }
  }
}
