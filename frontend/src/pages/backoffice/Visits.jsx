import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useMatch, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { FiAlertTriangle, FiCalendar, FiCheckSquare, FiChevronLeft, FiChevronRight, FiClock, FiList, FiPlus, FiUsers } from 'react-icons/fi'
import api from '../../services/api'
import { useFormat } from '../../utils/format'
import { Alert, Chip, Figure, IconAction, Legend, Rich, SegBar, Segmented } from './components/kit'
import { TONE_COLORS } from './components/kitTokens'
import VisitRow, { StatusChip } from './visits/VisitRow'
import useDayLabel from './visits/useDayLabel'
import VisitForm from './visits/VisitForm'
import { attendance, byDay, daysOf, localIso, rangeOf, shift, sameDay } from './visits/model'

const P = 'crm.pipeline.visits'
const STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']
const MUTED = '#B9B4AB'
const UNRESOLVED = '#E4E0D8'

const get = async (url, params) => (await api.get(url, { params })).data
const service = {
  confirm: (v) => api.post(`/backoffice/visits/${v.id}/confirm`),
  complete: (v, data) => api.put(`/backoffice/visits/${v.id}`, { ...data, status: 'completed' }),
  no_show: (v) => api.put(`/backoffice/visits/${v.id}`, { status: 'no_show' }),
  cancel: (v) => api.put(`/backoffice/visits/${v.id}`, { status: 'cancelled' }),
  delete: (v) => api.delete(`/backoffice/visits/${v.id}`),
}

function Card({ title, icon: Icon, aside, children, className = '' }) {
  return (
    <section className={`grid content-start gap-3.5 rounded-xl border border-gray-200 bg-white p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="flex items-center gap-2 font-display text-[14.5px] font-bold">
          <Icon className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Summary({ s, now }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtDate, fmtTime } = useFormat()
  const dayLabel = useDayLabel(now)
  const r = s.recent || { days: 90 }
  const { resolved, rate } = attendance(r)
  const next = s.next
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title={t('summary.upcoming')} icon={FiCalendar}>
        <Figure value={s.upcoming} />
        {next ? (
          <div className="grid gap-1 rounded-lg bg-gray-50 px-3.5 py-3 text-[13px]">
            <span className="font-bold">
              <span className="text-primary-700">{t('summary.next')} · {dayLabel(next.scheduled_at)}</span>
              {' '}{fmtDate(next.scheduled_at, { day: 'numeric', month: 'long' })}, {fmtTime(next.scheduled_at)}
            </span>
            <span className="truncate"><b className="font-semibold">{next.contact_name || t('visitor')}</b>{next.property_title ? ` · ${next.property_title}` : ''}</span>
            <span><StatusChip visit={next} now={now} /></span>
          </div>
        ) : <p className="text-sm text-gray-500">{t('summary.upcomingNone')}</p>}
      </Card>
      <Card title={t('summary.toConfirm')} icon={FiCheckSquare}>
        <Figure value={s.to_confirm}>{t('summary.toConfirmSub', { count: s.to_confirm })}</Figure>
        {s.overdue_total > 0 && <span><Chip tone="crit">{t('summary.overdue', { count: s.overdue_total })}</Chip></span>}
      </Card>
      <Card title={t('summary.attendance', { days: r.days })} icon={FiUsers}>
        {rate === null ? <p className="text-sm text-gray-500">{t('summary.attendanceNone', { days: r.days })}</p> : <>
          <Figure value={rate} unit="%">{t('summary.attendanceSub', { completed: r.completed, resolved })}</Figure>
          <SegBar
            label={t('summary.outcomesLabel', { honoured: r.completed, cancelled: r.cancelled, absent: r.no_show, unresolved: r.unresolved })}
            parts={[
              { value: r.completed, color: TONE_COLORS.good }, { value: r.cancelled, color: MUTED },
              { value: r.no_show, color: TONE_COLORS.crit }, { value: r.unresolved, color: UNRESOLVED },
            ]}
          />
          <Legend items={[
            { color: TONE_COLORS.good, label: `${t('summary.honoured')} ${r.completed}` },
            { color: MUTED, label: `${t('summary.cancelled')} ${r.cancelled}` },
            { color: TONE_COLORS.crit, label: `${t('summary.absent')} ${r.no_show}` },
            ...(r.unresolved ? [{ color: UNRESOLVED, label: `${t('summary.unresolved')} ${r.unresolved}` }] : []),
          ]} />
        </>}
      </Card>
    </div>
  )
}

export default function BackofficeVisits() {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtDate } = useFormat()
  const navigate = useNavigate()
  const creating = Boolean(useMatch('/backoffice/visites/nouvelle'))
  const qc = useQueryClient()
  const now = useMemo(() => new Date(), [])
  const dayLabel = useDayLabel(now)

  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(now)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [openKey, setOpenKey] = useState(null)
  const [editing, setEditing] = useState(null)

  const { start, end } = rangeOf(mode === 'list' ? 'week' : mode, anchor)
  const summary = useQuery(['bo-visits', 'summary'], () => get('/backoffice/visits/summary'))
  const range = useQuery(['bo-visits', 'range', localIso(start), localIso(end)],
    () => get('/backoffice/visits', { date_from: localIso(start), date_to: localIso(new Date(end - 1000)), per_page: 200 }),
    { enabled: mode !== 'list', keepPreviousData: true })
  const list = useQuery(['bo-visits', 'list', status, page],
    () => get('/backoffice/visits', { status: status || undefined, page, per_page: 20 }),
    { enabled: mode === 'list', keepPreviousData: true })

  const refresh = () => { qc.invalidateQueries('bo-visits'); qc.invalidateQueries('backoffice-dashboard') }
  const fail = (e) => toast.error(e?.response?.data?.error || t('toast.error'))
  const act = useMutation(({ kind, visit, data }) => service[kind](visit, data), { onSuccess: refresh })
  const save = useMutation(({ id, data }) => (id ? api.put(`/backoffice/visits/${id}`, data) : api.post('/backoffice/visits', data)), {
    onSuccess: (_, { id }) => { refresh(); toast.success(id ? t('toast.updated') : t('toast.created')); closeForm() },
    onError: fail,
  })

  const onAction = (kind, visit, data) => {
    if (kind === 'edit') { setEditing(visit); return Promise.resolve(false) }
    if (kind === 'delete' && !window.confirm(t('actions.deleteConfirm'))) return Promise.resolve(false)
    return act.mutateAsync({ kind, visit, data }).then(() => {
      if (kind === 'delete') { toast.success(t('toast.deleted')); setOpenKey(null) }
      return true
    }, (e) => { fail(e); return false })
  }

  const formOpen = creating || Boolean(editing)
  function closeForm() { setEditing(null); if (creating) navigate('/backoffice/visites') }
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (formOpen) closeForm()
      else setOpenKey(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const row = (section, v, extra) => {
    const key = `${section}-${v.id}`
    return (
      <VisitRow key={key} visit={v} now={now} saving={act.isLoading} onAction={onAction} {...extra}
        open={openKey === key} onToggle={() => setOpenKey(openKey === key ? null : key)} />
    )
  }

  const s = summary.data
  const days = byDay((range.data?.visits || []).filter((v) => !status || v.status === status), daysOf(mode, anchor))
  const shown = days.reduce((n, d) => n + d.visits.length, 0)
  const periodLabel = mode === 'day'
    ? fmtDate(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : t('agenda.weekRange', { from: fmtDate(days[0].date, { day: 'numeric', month: 'long' }), to: fmtDate(days.at(-1).date, { day: 'numeric', month: 'long', year: 'numeric' }) })

  const nav = (
    <div className="flex items-center gap-0.5">
      <IconAction icon={FiChevronLeft} label={t('agenda.prev')} onClick={() => setAnchor(shift(mode, anchor, -1))} className="rtl:[&>svg]:-scale-x-100" />
      <IconAction icon={FiCalendar} label={t('agenda.today')} onClick={() => setAnchor(now)} disabled={days.some((d) => sameDay(d.date, now))} className="disabled:opacity-40" />
      <IconAction icon={FiChevronRight} label={t('agenda.next')} onClick={() => setAnchor(shift(mode, anchor, 1))} tipAlign="end" className="rtl:[&>svg]:-scale-x-100" />
    </div>
  )
  const lp = list.data || {}

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-gray-500">{t('subtitle')}</p>
        </div>
        <IconAction icon={FiPlus} label={t('plan')} onClick={() => navigate('/backoffice/visites/nouvelle')} tone="primary" tipAlign="end" />
      </div>

      {(summary.isError || range.isError || list.isError) && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{t('loadError')}</p>}

      {s && <Summary s={s} now={now} />}

      {s?.overdue_total > 0 && (
        <Card title={t('overdue.title')} icon={FiAlertTriangle} className="border-red-200" aside={<Chip tone="crit">{s.overdue_total}</Chip>}>
          <Alert tone="crit" icon={FiClock}><Rich i18nKey={`${P}.overdue.alert`} values={{ count: s.overdue_total }} /></Alert>
          <ul>{s.overdue.map((v) => row('overdue', v, { showDate: true, quick: true }))}</ul>
          {s.overdue_total > s.overdue.length && <p className="text-[12.5px] text-gray-500">{t('overdue.more', { count: s.overdue_total - s.overdue.length })}</p>}
        </Card>
      )}

      <Card
        title={t('agenda.title')}
        icon={FiList}
        aside={(
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label={t('agenda.mode')} value={mode} onChange={(m) => { setMode(m); setOpenKey(null) }}
              options={[{ value: 'day', label: t('agenda.day') }, { value: 'week', label: t('agenda.week') }, { value: 'list', label: t('agenda.list') }]} />
            <select aria-label={t('agenda.statusFilter')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">{t('agenda.allStatuses')}</option>
              {STATUSES.map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}
            </select>
          </div>
        )}
      >
        {mode === 'list' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-500">
              <span>{t('agenda.allVisits')}</span>
              {lp.pages > 1 && (
                <span className="flex items-center gap-1">
                  <IconAction icon={FiChevronLeft} label={t('agenda.prevPage')} onClick={() => setPage(page - 1)} disabled={page <= 1} className="disabled:opacity-40 rtl:[&>svg]:-scale-x-100" />
                  <span className="tabular-nums">{t('agenda.page', { page, pages: lp.pages })}</span>
                  <IconAction icon={FiChevronRight} label={t('agenda.nextPage')} onClick={() => setPage(page + 1)} disabled={page >= lp.pages} tipAlign="end" className="disabled:opacity-40 rtl:[&>svg]:-scale-x-100" />
                </span>
              )}
            </div>
            {lp.visits?.length
              ? <ul>{lp.visits.map((v) => row('list', v, { showDate: true }))}</ul>
              : !list.isLoading && <p className="text-sm text-gray-500">{t('agenda.emptyList')}</p>}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px]">
                <b className="font-semibold">{periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}</b>
                <span className="text-gray-500"> · {t('agenda.count', { count: shown })}</span>
              </p>
              {nav}
            </div>
            <div aria-busy={range.isFetching}>
              {days.map((d) => (
                <div key={d.date.toISOString()} className="grid gap-x-4 border-t border-gray-100 py-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className={`pt-2 text-[13px] font-bold ${sameDay(d.date, now) ? 'text-primary-700' : ''}`}>
                    {dayLabel(d.date)}
                    <span className="block text-xs font-medium text-gray-500">{fmtDate(d.date, { day: 'numeric', month: 'long' })}</span>
                  </div>
                  {d.visits.length
                    ? <ul>{d.visits.map((v) => row('agenda', v))}</ul>
                    : <p className="py-2 text-[12.5px] text-gray-400 sm:pt-2.5">{t('agenda.emptyDay')}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {formOpen && (
        <VisitForm visit={editing} saving={save.isLoading} onClose={closeForm}
          onSubmit={(data) => save.mutate({ id: editing?.id, data })} />
      )}
    </div>
  )
}
