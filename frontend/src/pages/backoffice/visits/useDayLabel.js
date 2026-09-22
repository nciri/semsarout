import { useTranslation } from 'react-i18next'
import { useFormat } from '../../../utils/format'
import { dayOffset } from '../dashboard/model'

/** « Aujourd'hui », « Demain », sinon le jour de la semaine. */
export default function useDayLabel(now) {
  const { t } = useTranslation('backoffice', { keyPrefix: 'crm.pipeline.visits' })
  const { fmtDate } = useFormat()
  return (date) => {
    const off = dayOffset(date, now)
    if (off === 0) return t('agenda.today')
    if (off === 1) return t('agenda.tomorrow')
    const s = fmtDate(date, { weekday: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
}
