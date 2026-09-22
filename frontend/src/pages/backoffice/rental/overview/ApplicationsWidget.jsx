import { useMutation } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheckCircle, FiClock, FiExternalLink, FiHome, FiStar } from 'react-icons/fi'
import { rentalService } from '../../../../services/rentalService'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, IconAction, Rich, TD, TH } from '../../components/kit'
import { APP_TONE, groupByProperty, maskEmail } from '../model'
import { AgeChip, H3 } from '../parts'
import { useRentalFormat, useRentalRefresh } from '../hooks'

const APP_LO = 3
const APP_HI = 10

function VacantAlert({ vacant }) {
  const v = vacant.find((x) => x.days != null)
  if (!v) return null
  return (
    <Alert tone="warn" icon={FiHome}>
      <Rich i18nKey="rental.overview.apps.vacant" values={{ title: v.property_title || v.reference, count: v.days, candidates: v.candidates }} />
    </Alert>
  )
}

export function ApplicationsCompact({ s }) {
  const { t } = useTranslation('backoffice')
  const pending = s.applications.pending
  if (!pending.length) return <>
    <Alert tone="plain" icon={FiCheckCircle}>{t('rental.overview.apps.none')}</Alert>
    <VacantAlert vacant={s.vacant} />
  </>
  return (
    <>
      <Figure value={pending.length}>{t('rental.overview.apps.waiting', { count: pending.length })}</Figure>
      <ul className="grid">
        {pending.slice(0, 4).map((a) => (
          <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
            <b className="truncate font-semibold">{a.applicant_name || `#${a.id}`}</b>
            <span className="row-span-2 self-center"><AgeChip days={a.age_days || 0} lo={APP_LO} hi={APP_HI} /></span>
            <span className="truncate text-[12.5px] text-gray-500">
              {a.property_title || t('rental.application.propertyFallback', { id: a.property_id })} · {t(`rental.application.status.${a.status}`).toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
      <VacantAlert vacant={s.vacant} />
    </>
  )
}

export function ApplicationsDetail({ s, onClose, titleRef }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const f = useRentalFormat()
  const refresh = useRentalRefresh()
  const { pending, recent_decisions: decided, total } = s.applications
  const opts = (key) => ({
    onSuccess: () => { toast.success(t(`backoffice:rental.application.toasts.${key}`)); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const shortlist = useMutation((id) => rentalService.shortlistApplication(id), opts('shortlisted'))
  const unshortlist = useMutation((id) => rentalService.unshortlistApplication(id), opts('unshortlisted'))
  const oldest = pending[0]

  return (
    <DetailFrame title={t('backoffice:rental.overview.apps.detailTitle')}
      sub={t('backoffice:rental.overview.apps.detailSub', { count: pending.length, total })}
      link={{ to: '/backoffice/gestion-locative/candidatures', label: t('backoffice:rental.overview.apps.viewAll') }}
      onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!pending.length ? <p className="text-sm text-gray-500">{t('backoffice:rental.overview.apps.none')}</p> : (
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('backoffice:rental.application.columns.candidate')}</th>
              <th className={TH}>{t('backoffice:rental.application.columns.submittedAt')}</th>
              <th className={`${TH} text-end`}>{t('backoffice:rental.application.columns.monthlyIncome')}</th>
              <th className={`${TH} text-end`}>{t('backoffice:rental.overview.apps.docs')}</th>
              <th className={TH}>{t('backoffice:rental.application.columns.status')}</th>
              <th className={`${TH} text-end`}><span className="sr-only">{t('backoffice:rental.overview.actions')}</span></th>
            </tr></thead>
            <tbody>
              {groupByProperty(pending).flatMap((g) => [
                <tr key={`g-${g.property_id}`}>
                  <td colSpan={6} className={`${TD} bg-gray-50 text-[12.5px] font-bold`}>{g.title || t('backoffice:rental.application.propertyFallback', { id: g.property_id })}</td>
                </tr>,
                ...g.apps.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className={TD}>
                      <b className="font-semibold">{a.applicant_name || `#${a.id}`}</b>
                      {a.submitted_by_agency && <span className="ms-1.5 whitespace-nowrap rounded bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-500">{t('backoffice:rental.overview.apps.byAgency')}</span>}
                      {a.applicant_email && <span className="block text-xs text-gray-500">{maskEmail(a.applicant_email)}</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{f.date(a.submitted_at, { day: 'numeric', month: 'short' })} <AgeChip days={a.age_days || 0} lo={APP_LO} hi={APP_HI} /></td>
                    <td className={`${TD} text-end tabular-nums`}>
                      {a.monthly_income != null ? f.n(a.monthly_income) : '—'}
                      {a.guarantor_income != null && <span className="block text-xs text-gray-500">{t('backoffice:rental.overview.apps.guarantor', { amount: f.n(a.guarantor_income) })}</span>}
                    </td>
                    <td className={`${TD} text-end tabular-nums`}>{a.documents_count || <Chip tone="warn">0</Chip>}</td>
                    <td className={TD}><Chip tone={APP_TONE[a.status]}>{t(`backoffice:rental.application.status.${a.status}`)}</Chip></td>
                    <td className={`${TD} whitespace-nowrap text-end`}>
                      {a.status === 'shortlist'
                        ? <IconAction icon={FiStar} label={t('backoffice:rental.application.actions.unshortlist')} disabled={unshortlist.isLoading} onClick={() => unshortlist.mutate(a.id)} className="[&>svg]:fill-current" />
                        : <IconAction icon={FiStar} label={t('backoffice:rental.application.actions.shortlist')} tone="gold" disabled={shortlist.isLoading} onClick={() => shortlist.mutate(a.id)} />}
                      <IconAction icon={FiExternalLink} label={t('backoffice:rental.overview.open.application')} to={`/backoffice/gestion-locative/candidatures/${a.id}`} tipAlign="end" />
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        )}
        aside={<>
          <VacantAlert vacant={s.vacant} />
          {oldest && oldest.age_days > APP_LO && (
            <Alert tone="warn" icon={FiClock}><Rich i18nKey="rental.overview.apps.oldest" values={{ name: oldest.applicant_name || `#${oldest.id}`, count: oldest.age_days, docs: oldest.documents_count }} /></Alert>
          )}
          <H3>{t('backoffice:rental.overview.apps.recent')}</H3>
          {!decided.length ? <p className="m-0 text-[12.5px] text-gray-500">{t('backoffice:rental.overview.apps.noRecent')}</p> : (
            <ul className="grid">
              {decided.map((a) => (
                <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
                  <b className="truncate font-semibold">{a.applicant_name || `#${a.id}`}</b>
                  <span className="row-span-2 self-center"><Chip tone={APP_TONE[a.status]}>{t(`backoffice:rental.application.status.${a.status}`)}</Chip></span>
                  <span className="truncate text-[12.5px] text-gray-500">{a.property_title} · {f.date(a.decided_at, { day: 'numeric', month: 'long' })}</span>
                </li>
              ))}
            </ul>
          )}
        </>}
      />
    </DetailFrame>
  )
}
