import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiLock, FiRefreshCw, FiRss } from 'react-icons/fi'
import { stayService } from '../../../services/stayService'
import { useFormat } from '../../../utils/format'
import { GatedNotice } from '../../../components/backoffice/ui'
import { Alert, IconAction, Kv } from '../components/kit'

/**
 * Les rubriques ne sont pas au même niveau : « Planning » et « Calendrier » montrent les
 * mêmes séjours autrement, « Ménage » et « Messages » n'existent que parce qu'il y a des
 * séjours, et « Accès » / « Équipes » se règlent par bien, une fois, avant tout séjour.
 * Un rang d'onglets les posait côte à côte comme sept choix équivalents ; la colonne les
 * range par rôle et éteint ce qui n'a encore rien à traiter.
 *
 * `needsStays` porte cette dépendance : sans séjour enregistré, la rubrique s'affiche en
 * attente plutôt que de mener à une page vide.
 */
const NAV = [
  { key: 'bookings', items: [{ to: '', end: true, key: 'planning' }, { to: 'calendrier', key: 'calendar' }] },
  { key: 'operations', needsStays: true, items: [{ to: 'menage', key: 'cleaning' }, { to: 'messages', key: 'messages' }] },
  { key: 'setup', items: [{ to: 'acces', key: 'access' }, { to: 'equipes', key: 'teams' }] },
]

const ITEM = 'rounded-lg px-2.5 py-1.5 text-start text-[13px] leading-snug'

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
  // Tant que l'aperçu n'est pas arrivé, on ne présume pas l'absence de séjours : éteindre
  // les rubriques au chargement les ferait clignoter.
  const hasStays = !o || (o.stays_total || 0) > 0
  const inError = o?.sources?.in_error || 0

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('backoffice:stays.shared.pageTitle')}</h1>
          <p className="mt-1 text-gray-500">{fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {/* Les calendriers connectés alimentent les séjours : le réglage se tient à côté de
            la synchronisation qui s'en sert, pas dans les rubriques qu'il remplit. */}
        <div className="flex items-center gap-1">
          <IconAction icon={FiRss} label={t('backoffice:stays.overview.openCalendars')} to="calendriers"
            tone={inError > 0 ? 'danger' : 'default'} />
          <IconAction icon={FiRefreshCw} label={t('backoffice:stays.overview.syncAll')} onClick={() => syncAll.mutate()}
            tone="primary" tipAlign="end" disabled={syncAll.isLoading} />
        </div>
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
            sub={t('backoffice:stays.overview.channelsInError', { count: inError })}
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
      {inError > 0 && (
        <Alert tone="warn" icon={FiRefreshCw}>
          {t('backoffice:stays.overview.sourcesInError', { count: inError })}{' '}
          <Link to="/backoffice/sejours/calendriers" className="font-semibold underline">
            {t('backoffice:stays.overview.seeChannels')}
          </Link>
        </Alert>
      )}

      <section className="grid min-w-0 gap-4 rounded-xl border border-gray-200 bg-white p-3.5 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-5 sm:p-5">
        <nav aria-label={t('backoffice:stays.overview.navLabel')} className="grid gap-4 self-start sm:border-e sm:border-gray-200 sm:pe-5">
          {NAV.map((group) => {
            const dormant = group.needsStays && !hasStays
            return (
              <div key={group.key} className="grid gap-0.5">
                <h2 className="px-2.5 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  {t(`backoffice:stays.overview.groups.${group.key}`)}
                </h2>
                {group.items.map((item) => (dormant ? (
                  <span key={item.key} aria-disabled="true" className={`${ITEM} font-medium text-gray-400`}>
                    {t(`backoffice:stays.overview.tabs.${item.key}`)}
                  </span>
                ) : (
                  <NavLink key={item.key} to={item.to} end={item.end}
                    className={({ isActive }) => `${ITEM} ${isActive ? 'bg-primary-50 font-semibold text-primary-800' : 'font-medium text-gray-600 hover:bg-gray-50'}`}>
                    {t(`backoffice:stays.overview.tabs.${item.key}`)}
                  </NavLink>
                )))}
                {dormant && (
                  <p className="px-2.5 pt-1 text-[11.5px] leading-snug text-gray-500">
                    {t('backoffice:stays.overview.needStays')}
                  </p>
                )}
              </div>
            )
          })}
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </section>
    </div>
  )
}
export default StaysLayout
