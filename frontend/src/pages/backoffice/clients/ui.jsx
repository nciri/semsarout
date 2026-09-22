import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiAlertTriangle, FiClock, FiMail, FiUsers } from 'react-icons/fi'
import { Chip } from '../components/kit'
import { ageTone } from './model'
import { P, STATUS_TONE, useClientLabels } from './labels'

export function StatusChip({ status }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={STATUS_TONE[status] || 'neutral'}>{t(`crm.shared.status.${status}`, { defaultValue: status })}</Chip>
}

export function AgeChip({ age }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={ageTone(age)}>{age === null ? t(`${P}.never`) : t('dashboard.units.days', { count: age })}</Chip>
}

export function ClientCell({ d }) {
  const { typeLine } = useClientLabels()
  return (
    <>
      <b className="block font-semibold">{d.name}</b>
      <span className="block text-xs text-gray-500">{typeLine(d.client)}</span>
    </>
  )
}

const FLAG_ICONS = { staleLead: FiMail, txUnfollowed: FiAlertCircle, reviewStatus: FiAlertTriangle, hotNoOffer: FiClock, duplicate: FiUsers }

export function Flag({ flag }) {
  const { t } = useTranslation('backoffice')
  if (!flag) return null
  const Icon = FLAG_ICONS[flag.key]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${flag.tone === 'crit' ? 'text-red-700' : 'text-amber-700'}`}>
      <Icon className="h-[13px] w-[13px]" aria-hidden="true" />{t(`${P}.flags.${flag.key}`)}
    </span>
  )
}
