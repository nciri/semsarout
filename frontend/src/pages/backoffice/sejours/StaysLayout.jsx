import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCalendar, FiLock, FiRefreshCw } from 'react-icons/fi'
import { stayService } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { GatedNotice } from '../../../components/backoffice/ui'
import { Alert, IconAction, Kv } from '../components/kit'

const TABS = [
  { to: '', end: true, key: 'planning' },
  { to: 'calendrier', key: 'calendar' },
  { to: 'menage', key: 'cleaning' },
  { to: 'messages', key: 'messages' },
  { to: 'acces', key: 'access' },
  { to: 'equipes', key: 'teams' },
  { to: 'calendriers', key: 'calendars' },
]

function StaysLayout() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate, fmtNumber } = useFormat()
  const qc = useQueryClient()
  const { data: o, error } = useQuery('stays-overview', () => stayService.overview(), { refetchInterval: 60000 })

  const syncAll = useMutation(() => stayService.syncAll(), {
    onSuccess: (r) => {
      toast.success(t('backoffice:stays.overview.syncDone', { ok: r.ok, failed: r.failed }))
      qc.invalidateQueries('stays-overview')
      qc.invalidateQueries('stays-sources')
      qc.invalidateQueries('stays-list')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title={t('backoffice:stays.shared.pageTitle')} message={t('backoffice:stays.shared.gated')} />
  }

  const n = (v) => fmtNumber(v || 0)

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('backoffice:stays.shared.pageTitle')}</h1>
          <p className="mt-1 text-gray-500">{fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <IconAction icon={FiRefreshCw} label={t('backoffice:stays.overview.syncAll')} onClick={() => syncAll.mutate()}
          tone="primary" tipAlign="end" disabled={syncAll.isLoading} />
      </div>

      {o && (
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-3 xl:grid-cols-6">
          <Kv label={t('backoffice:stays.overview.arrivals')} value={n(o.arrivals_today)}
            to="/backoffice/sejours?vue=arrivals" />
          <Kv label={t('backoffice:stays.overview.departures')} value={n(o.departures_today)}
            to="/backoffice/sejours?vue=departures" />
          <Kv label={t('backoffice:stays.overview.inHouse')} value={n(o.in_house)}
            to="/backoffice/sejours?vue=in_house" />
          <Kv label={t('backoffice:stays.overview.upcoming')} value={n(o.upcoming)}
            to="/backoffice/sejours?vue=upcoming" />
          <Kv label={t('backoffice:stays.overview.nights')} value={n(o.nights_booked)}
            to="/backoffice/sejours/calendrier" />
          <Kv label={t('backoffice:stays.overview.channels')} value={n(o.sources?.total)}
            sub={t('backoffice:stays.overview.channelsInError', { count: o.sources?.in_error || 0 })}
            to="/backoffice/sejours/calendriers" />
        </div>
      )}

      {o?.conflicts > 0 && (
        <Alert tone="crit" icon={FiAlertTriangle}>
          {t('backoffice:stays.overview.conflicts', { count: o.conflicts })}{' '}
          <Link to="/backoffice/sejours?vue=conflicts" className="font-semibold underline">
            {t('backoffice:stays.overview.seeConflicts')}
          </Link>
        </Alert>
      )}
      {o?.sources?.in_error > 0 && (
        <Alert tone="warn" icon={FiRefreshCw}>
          {t('backoffice:stays.overview.sourcesInError', { count: o.sources.in_error })}{' '}
          <Link to="/backoffice/sejours/calendriers" className="font-semibold underline">
            {t('backoffice:stays.overview.seeChannels')}
          </Link>
        </Alert>
      )}

      <section aria-labelledby="stays-register" className="grid min-w-0 gap-3.5 rounded-xl border border-gray-200 bg-white px-3.5 pb-3 pt-[18px] sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2.5">
          <h2 id="stays-register" className="flex items-center gap-2 font-display text-[15px] font-bold">
            <FiCalendar className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{t('backoffice:stays.overview.register')}
          </h2>
          <nav aria-label={t('backoffice:stays.overview.registerTabs')} className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-[3px]">
            {TABS.map((tab) => (
              <NavLink key={tab.key} to={tab.to} end={tab.end}
                className={({ isActive }) => `rounded-md px-2.5 py-1 text-[12.5px] ${isActive ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-600'}`}>
                {t(`backoffice:stays.overview.tabs.${tab.key}`)}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="min-w-0"><Outlet /></div>
      </section>
    </div>
  )
}
export default StaysLayout
