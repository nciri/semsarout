import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import {
  FiArrowDown, FiArrowUp, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiMail,
  FiRotateCcw, FiSearch, FiUserPlus, FiX,
} from 'react-icons/fi'
import api from '../../services/api'
import { useFormat } from '../../utils/format'
import { Chip, IconAction, TD, TH } from './components/kit'
import { SOURCE_COLORS, agingTone, daysSince } from './dashboard/model'
import { NEXT_STATUS, STATUSES, STATUS_TONES, isOpen } from './leads/model'
import Summary from './leads/Summary'
import LeadFiche from './leads/LeadFiche'

const K = 'crm.pipeline.leads'
const PER_PAGE = 20
const FILTER_SOURCES = ['phone_reveal', 'callback_request', 'contact_form', 'website', 'manual', 'service_request']

const backofficeService = {
  getLeads: async (params) => (await api.get(`/backoffice/leads?${new URLSearchParams(params)}`)).data,
  getStats: async () => (await api.get('/backoffice/leads/stats')).data,
  getAgents: async () => (await api.get('/backoffice/leads/agents')).data,
  // Même clé et même requête que la sidebar et le tableau de bord : la liste des leads « nouveaux ».
  getDashboard: async () => (await api.get('/backoffice/dashboard')).data,
  updateLead: async ({ id, data }) => (await api.put(`/backoffice/leads/${id}`, data)).data,
  assignLead: async ({ id, userId }) => (await api.post(`/backoffice/leads/${id}/assign`, { user_id: userId })).data,
  convertToClient: async (id) => (await api.post(`/backoffice/clients/convert-lead/${id}`)).data,
}

const EMPTY_FILTERS = { status: '', source: '', assigned_to: '', page: 1 }

function SortTH({ label, field, sort, onSort, className = '' }) {
  const active = sort.field === field
  const Arrow = active && sort.order === 'asc' ? FiArrowUp : FiArrowDown
  const { t } = useTranslation('backoffice')
  return (
    <th className={`${TH} ${className}`} aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)} title={t(`${K}.list.sortBy`, { column: label })}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}>
        {label}
        <Arrow className={`h-3 w-3 ${active ? 'text-primary-700' : 'text-gray-300'}`} aria-hidden="true" />
      </button>
    </th>
  )
}

const selectCls = 'rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-400'

export default function BackofficeLeads() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState({ field: 'created_at', order: 'desc' })
  const [openId, setOpenId] = useState(null)
  const listRef = useRef(null)
  const now = new Date()

  const { data, isLoading, isError } = useQuery(
    ['backoffice-leads', filters, search, sort],
    () => backofficeService.getLeads({
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
      per_page: PER_PAGE, q: search, sort_by: sort.field, sort_order: sort.order,
    }),
    { keepPreviousData: true },
  )
  const { data: stats } = useQuery('backoffice-leads-stats', backofficeService.getStats)
  const { data: dash } = useQuery('backoffice-dashboard', backofficeService.getDashboard)
  const { data: agentsData } = useQuery('backoffice-leads-agents', backofficeService.getAgents, { staleTime: 300000 })
  const agents = agentsData?.agents || []

  const refresh = () => {
    for (const key of ['backoffice-leads', 'backoffice-leads-stats', 'backoffice-dashboard', 'backoffice-lead-duplicates']) {
      queryClient.invalidateQueries(key)
    }
  }
  const updateMutation = useMutation(backofficeService.updateLead, { onSuccess: refresh })
  const assignMutation = useMutation(backofficeService.assignLead, { onSuccess: refresh })
  const convertMutation = useMutation(backofficeService.convertToClient, {
    onSuccess: () => { refresh(); queryClient.invalidateQueries('backoffice-clients') },
  })

  useEffect(() => {
    if (!openId) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setOpenId(null)
      document.getElementById(`lead-toggle-${openId}`)?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openId])

  const statusLabel = (s) => t(`${K}.status.${s}`, { defaultValue: s })
  const displayName = (lead) => lead.name || t(`${K}.list.noName`)

  const handleAdvanceStatus = (lead) => {
    const nextStatus = NEXT_STATUS[lead.status]
    if (!nextStatus) return
    const message = lead.status === 'qualified'
      ? t(`${K}.confirm.convert`, { name: displayName(lead) })
      : t(`${K}.confirm.markStatus`, { name: displayName(lead), status: statusLabel(nextStatus).toLowerCase() })
    if (!window.confirm(message)) return
    if (lead.status === 'qualified') convertMutation.mutate(lead.id)
    else updateMutation.mutate({ id: lead.id, data: { status: nextStatus } })
  }

  const handleMarkLost = (lead) => {
    if (window.confirm(t(`${K}.confirm.lost`, { name: displayName(lead) }))) {
      updateMutation.mutate({ id: lead.id, data: { status: 'lost' } })
    }
  }

  const handleSort = (field) => setSort((prev) => ({
    field, order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
  }))
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: 1 }))

  const showPending = () => {
    setFilters({ ...EMPTY_FILTERS, status: 'new' })
    setSort({ field: 'created_at', order: 'asc' })
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    listRef.current?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }

  const filtered = search || filters.status || filters.source || filters.assigned_to
  const leads = data?.leads || []
  const page = filters.page

  return (
    <div className="mx-auto grid w-full max-w-[1360px] grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{t(`${K}.list.pageTitle`)}</h1>
        <p className="mt-1 text-gray-500">{t(`${K}.list.subtitle`)}</p>
      </div>

      <Summary
        pending={dash?.widgets?.new_leads || []}
        stats={stats}
        now={now}
        source={filters.source}
        onShowPending={showPending}
        onSource={(s) => setFilter('source', s)}
      />

      <section ref={listRef} aria-labelledby="leads-list-title" className="scroll-mt-4 rounded-xl border border-gray-200 bg-white">
        <div className="grid gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
          <h2 id="leads-list-title" className="font-display text-[14.5px] font-bold">
            {t(`${K}.list.listTitle`, { count: data?.total ?? 0 })}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 basis-full md:basis-0 md:flex-1">
              <span className="sr-only">{t(`${K}.list.searchPlaceholder`)}</span>
              <FiSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                placeholder={t(`${K}.list.searchPlaceholder`)}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFilters((f) => ({ ...f, page: 1 })) }}
                className="w-full rounded-lg border border-gray-200 py-2 pe-3 ps-9 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
            <select aria-label={t(`${K}.list.filterStatusLabel`)} value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={`${selectCls} min-w-0 flex-1 md:flex-none`}>
              <option value="">{t(`${K}.list.filterStatusAll`)}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <select aria-label={t(`${K}.list.filterSourceLabel`)} value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className={`${selectCls} min-w-0 flex-1 md:flex-none`}>
              <option value="">{t(`${K}.list.filterSourceAll`)}</option>
              {FILTER_SOURCES.map((s) => <option key={s} value={s}>{t(`${K}.source.${s}`)}</option>)}
            </select>
            <select aria-label={t(`${K}.list.filterAgentLabel`)} value={filters.assigned_to} onChange={(e) => setFilter('assigned_to', e.target.value)} className={`${selectCls} min-w-0 flex-1 md:flex-none`}>
              <option value="">{t(`${K}.list.filterAgentAll`)}</option>
              <option value="none">{t(`${K}.list.unassigned`)}</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
            </select>
            {filtered && (
              <IconAction icon={FiRotateCcw} label={t(`${K}.list.resetFilters`)} tipAlign="end"
                onClick={() => { setFilters(EMPTY_FILTERS); setSearch('') }} />
            )}
          </div>
        </div>

        {isError && <p className="m-4 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800">{t(`${K}.list.loadError`)}</p>}

        {isLoading ? (
          <div aria-busy="true" aria-label={t(`${K}.list.loading`)} className="grid gap-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />)}
          </div>
        ) : leads.length > 0 ? (
          <>
            <div className="overflow-x-auto px-1 pt-3 sm:px-2">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <SortTH label={t(`${K}.list.columns.contact`)} field="name" sort={sort} onSort={handleSort} />
                    <th className={`${TH} hidden 2xl:table-cell`}>{t(`${K}.list.columns.contactInfo`)}</th>
                    <SortTH label={t(`${K}.list.columns.source`)} field="source" sort={sort} onSort={handleSort} className="hidden md:table-cell" />
                    <th className={`${TH} hidden xl:table-cell`}>{t(`${K}.list.columns.property`)}</th>
                    <SortTH label={t(`${K}.list.columns.status`)} field="status" sort={sort} onSort={handleSort} className="hidden sm:table-cell" />
                    <th className={`${TH} hidden xl:table-cell`}>{t(`${K}.list.columns.agent`)}</th>
                    <SortTH label={t(`${K}.list.columns.received`)} field="created_at" sort={sort} onSort={handleSort} />
                    <th className={`${TH} text-end`}><span className="sr-only">{t(`${K}.list.columns.actions`)}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const open = openId === lead.id
                    const days = daysSince(lead.created_at, now)
                    return (
                      <Fragment key={lead.id}>
                        <tr className={open ? 'bg-primary-50/40' : 'hover:bg-gray-50'}>
                          <td className={`${TD} max-w-[14rem]`}>
                            <b className="block truncate font-semibold">{displayName(lead)}</b>
                            {lead.message && <span className="hidden truncate text-xs text-gray-500 md:block">{lead.message}</span>}
                            <span className="mt-0.5 block sm:hidden"><Chip tone={STATUS_TONES[lead.status]}>{statusLabel(lead.status)}</Chip></span>
                          </td>
                          <td className={`${TD} hidden 2xl:table-cell`}>
                            <span dir="ltr" className="block max-w-[13rem] truncate text-gray-600">{lead.email}</span>
                            <span dir="ltr" className="block text-gray-600">{lead.phone}</span>
                          </td>
                          <td className={`${TD} hidden whitespace-nowrap md:table-cell`}>
                            <span className="me-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: SOURCE_COLORS[lead.source] || '#9AA0AB' }} />
                            {t(`${K}.source.${lead.source}`, { defaultValue: lead.source })}
                          </td>
                          <td className={`${TD} hidden max-w-[12rem] xl:table-cell`}>
                            <span className={`block truncate ${lead.property_title ? '' : 'text-gray-400'}`} title={lead.property_title || undefined}>
                              {lead.property_title || t(`${K}.list.noProperty`)}
                            </span>
                          </td>
                          <td className={`${TD} hidden sm:table-cell`}><Chip tone={STATUS_TONES[lead.status]}>{statusLabel(lead.status)}</Chip></td>
                          <td className={`${TD} hidden whitespace-nowrap xl:table-cell ${lead.assigned_to_name ? '' : 'text-gray-400'}`}>
                            {lead.assigned_to_name || t(`${K}.list.unassigned`)}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            <span className="hidden tabular-nums text-gray-600 md:inline">{fmtDate(lead.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} </span>
                            {isOpen(lead.status)
                              ? <Chip tone={agingTone(days)}>{t('dashboard.units.days', { count: days })}</Chip>
                              : <span className="tabular-nums text-gray-600 md:hidden">{fmtDate(lead.created_at, { day: 'numeric', month: 'short' })}</span>}
                          </td>
                          <td className={`${TD} text-end`}>
                            <div className="inline-flex items-center gap-0.5">
                              {isOpen(lead.status) && (
                                <>
                                  <IconAction
                                    icon={lead.status === 'qualified' ? FiUserPlus : FiCheck}
                                    label={t(`${K}.nextAction.${lead.status}`)}
                                    onClick={() => handleAdvanceStatus(lead)}
                                    tone="gold"
                                  />
                                  <IconAction icon={FiX} label={t(`${K}.list.markLost`)} onClick={() => handleMarkLost(lead)} tone="danger" />
                                </>
                              )}
                              <IconAction
                                id={`lead-toggle-${lead.id}`}
                                icon={FiChevronDown}
                                label={open ? t(`${K}.list.hideDetails`) : t(`${K}.list.viewDetails`)}
                                onClick={() => setOpenId(open ? null : lead.id)}
                                aria-expanded={open}
                                aria-controls={`lead-fiche-${lead.id}`}
                                tipAlign="end"
                                className={`[&>svg]:transition-transform motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''}`}
                              />
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr id={`lead-fiche-${lead.id}`}>
                            <td colSpan={8} className="border-t border-primary-100 bg-white px-3 pb-6 pt-4 sm:px-4">
                              <h3 className="sr-only">{t(`${K}.detail.title`, { name: displayName(lead) })}</h3>
                              <LeadFiche lead={lead} agents={agents} onAssign={(l, userId) => assignMutation.mutate({ id: l.id, userId })} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {data.pages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
                <p className="text-[13px] text-gray-500">
                  {t(`${K}.list.paginationInfo`, { from: (page - 1) * PER_PAGE + 1, to: Math.min(page * PER_PAGE, data.total), total: data.total })}
                </p>
                <div className="flex items-center gap-1">
                  <IconAction icon={FiChevronLeft} label={t(`${K}.list.prev`)} disabled={page === 1}
                    onClick={() => setFilters({ ...filters, page: page - 1 })} className="rtl:[&>svg]:rotate-180 disabled:opacity-40" />
                  <span className="text-[13px] tabular-nums text-gray-600">{page} / {data.pages}</span>
                  <IconAction icon={FiChevronRight} label={t(`${K}.list.next`)} disabled={page === data.pages} tipAlign="end"
                    onClick={() => setFilters({ ...filters, page: page + 1 })} className="rtl:[&>svg]:rotate-180 disabled:opacity-40" />
                </div>
              </div>
            )}
          </>
        ) : !isError && (
          <div className="p-12 text-center">
            <FiMail className="mx-auto mb-4 h-10 w-10 text-gray-300" aria-hidden="true" />
            <h3 className="mb-1 font-display text-base font-bold">{t(`${K}.list.empty.title`)}</h3>
            <p className="text-gray-500">{filtered ? t(`${K}.list.empty.filtered`) : t(`${K}.list.empty.default`)}</p>
          </div>
        )}
      </section>
    </div>
  )
}
