import { useTranslation } from 'react-i18next'
import { useFormat } from '../../../utils/format'

export const TONE_COLORS = { good: '#1E7F4E', warn: '#B45309', crit: '#B42318' }

/** Montants au format du tableau de bord : « 27,3 M Dh », « 729 k Dh », « 2 903 Dh/mois ». */
export function useMoney() {
  const { t } = useTranslation('backoffice')
  const { fmtNumber } = useFormat()
  const parts = (v, type) => {
    if (type === 'rent') return [fmtNumber(Math.round(v)), t('dashboard.units.perMonth')]
    if (v >= 1e6) return [fmtNumber(v / 1e6, { maximumFractionDigits: 1 }), t('dashboard.units.million')]
    if (v >= 1000) return [fmtNumber(Math.round(v / 1000)), t('dashboard.units.thousand')]
    return [fmtNumber(Math.round(v)), t('dashboard.units.dirham')]
  }
  const money = (v, type) => parts(v, type).join(' ')
  money.parts = parts
  return money
}
