import { useQuery } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiLock } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { GatedNotice } from '../../../components/backoffice/ui'
import SignaturePanel from '../../../components/backoffice/SignaturePanel'
import DirIcon from '../../../components/common/DirIcon'
import useAuthStore from '../../../store/authStore'
import { Chip } from '../components/kit'
import { LEASE_TONE, maskEmail, maskPhone } from './model'
import LeasePanel from './LeasePanel'

function LeaseDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const { user } = useAuthStore()
  const managerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email
  const managerEmail = user?.email
  const { data: l, isLoading, error } = useQuery(['rental-lease', id], () => rentalService.getLease(id))

  const back = (label) => (
    <Link to="/backoffice/gestion-locative/baux" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
      <DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {label}
    </Link>
  )

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.lease.gated.message')} />
  if (isLoading) return <div className="p-6 text-gray-500">{t('backoffice:rental.shared.loading')}</div>
  if (!l) return (
    <div className="p-6">
      {back(t('backoffice:rental.shared.back'))}
      <p className="mt-4 text-gray-500">{t('backoffice:rental.shared.notFound')}</p>
    </div>
  )

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      {back(t('backoffice:rental.lease.backToList'))}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">
            {[l.property_title || t('backoffice:rental.lease.detail.title', { reference: l.reference }), l.property_city].filter(Boolean).join(', ')}
          </h1>
          <p className="mt-1 text-gray-500">
            {[l.reference, l.tenant_name, l.tenant_phone && maskPhone(l.tenant_phone), l.tenant_email && maskEmail(l.tenant_email)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Chip tone={LEASE_TONE[l.status] || 'neutral'}>{t(`backoffice:rental.lease.status.${l.status}`, { defaultValue: l.status })}</Chip>
      </div>
      <section className="rounded-xl border border-gray-200 bg-white px-4 pb-6 pt-5 sm:px-6">
        <LeasePanel lease={l} />
      </section>
      <SignaturePanel docType="lease" docId={id} managerName={managerName} managerEmail={managerEmail} />
    </div>
  )
}
export default LeaseDetail
