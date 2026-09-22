import { Fragment, useCallback, useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import {
  FiArrowUpRight, FiChevronDown, FiChevronLeft, FiChevronRight, FiGrid, FiPlus, FiRotateCcw, FiSearch,
} from 'react-icons/fi'
import api from '../../services/api'
import { useFormat } from '../../utils/format'
import { Chip, IconAction, Segmented, TD, TH } from './components/kit'
import { useMoney } from './components/kitTokens'
import Summary from './transactions/Summary'
import Fiche from './transactions/Fiche'
import {
  DEFAULT_PERIOD, PERIODS, STATUSES, TYPES, dealValue, isOverdue, queryParams, sinceFor, stagesFor, statusTone, withType,
} from './transactions/model'

const fetchList = async (params) => (await api.get('/backoffice/transactions', { params })).data
const fetchSummary = async (params) => (await api.get('/backoffice/transactions/summary', { params })).data

const EMPTY = { type: '', stage: '', status: '', agent_id: '', page: 1 }
const selectCls = 'h-9 min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-400'

export default function BackofficeTransactions() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  const l = (key, opts) => t(`crm.transactions.list.${key}`, opts)
  const [now] = useState(() => new Date())
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [filters, setFilters] = useState(EMPTY)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const since = sinceFor(period, now)

  const list = useQuery(
    ['backoffice-transactions', filters, search, since],
    () => fetchList(queryParams({ ...filters, q: search, since })),
    { keepPreviousData: true },
  )
  const summary = useQuery(
    ['backoffice-transactions-summary', since, filters.agent_id],
    () => fetchSummary(queryParams({ since, agent_id: filters.agent_id })),
    { keepPreviousData: true },
  )

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }))
  const filtered = search || filters.type || filters.stage || filters.status || filters.agent_id
  const rows = list.data?.transactions || []
  const pages = list.data?.pages || 1

  const close = useCallback(() => {
    if (openId == null) return
    document.getElementById(`tx-toggle-${openId}`)?.focus()
    setOpenId(null)
  }, [openId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{l('pageTitle')}</h1>
          <p className="mt-1 text-gray-500">{l('subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <IconAction icon={FiGrid} label={l('pipelineViewLink')} to="/backoffice/pipeline" className="border border-gray-200 bg-white" />
          <IconAction icon={FiPlus} label={l('newButton')} to="/backoffice/transactions/nouveau" tone="primary" tipAlign="end" />
        </div>
      </div>

      <section aria-labelledby="tx-summary" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="tx-summary" className="font-display text-base font-bold">{l('summary.title')}</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              {since ? l('summary.since', { date: fmtDate(`${since}T00:00`, { day: 'numeric', month: 'long', year: 'numeric' }) }) : l('summary.allTime')}
              {' · '}{l('summary.separate')}
            </p>
          </div>
          <Segmented
            label={l('period.label')}
            value={period}
            options={PERIODS.map((p) => ({ value: p, label: l(`period.${p}`) }))}
            onChange={(p) => { setPeriod(p); setFilters((f) => ({ ...f, page: 1 })) }}
          />
        </div>
        {summary.data
          ? <Summary data={summary.data} />
          : summary.isLoading && (
            <div aria-busy="true" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none" />)}
            </div>
          )}
      </section>

      <section aria-labelledby="tx-registry" className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="tx-registry" className="font-display text-base font-bold">{l('registry')}</h2>
          {list.data && <span className="text-[12.5px] text-gray-500">{l('total', { count: list.data.total })}</span>}
        </div>

        <div role="group" aria-label={l('filters.label')} className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-[1_1_220px]">
            <span className="sr-only">{l('searchPlaceholder')}</span>
            <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFilters((f) => ({ ...f, page: 1 })) }}
              placeholder={l('searchPlaceholder')}
              className={`${selectCls} w-full ps-8`}
            />
          </label>
          <select aria-label={l('filters.type')} value={filters.type} onChange={(e) => setFilters((f) => withType(f, e.target.value))} className={`${selectCls} flex-[1_1_130px]`}>
            <option value="">{l('filters.typeAll')}</option>
            {TYPES.map((k) => <option key={k} value={k}>{t(`crm.transactions.type.${k}`)}</option>)}
          </select>
          <select aria-label={l('filters.stage')} value={filters.stage} onChange={set('stage')} className={`${selectCls} flex-[1_1_150px]`}>
            <option value="">{l('filters.stageAll')}</option>
            {stagesFor(filters.type).map((k) => <option key={k} value={k}>{t(`crm.transactions.stage.${k}`)}</option>)}
          </select>
          <select aria-label={l('filters.status')} value={filters.status} onChange={set('status')} className={`${selectCls} flex-[1_1_140px]`}>
            <option value="">{l('filters.statusAll')}</option>
            {STATUSES.map((k) => <option key={k} value={k}>{t(`crm.transactions.status.${k}`)}</option>)}
          </select>
          <select aria-label={l('filters.agent')} value={filters.agent_id} onChange={set('agent_id')} className={`${selectCls} flex-[1_1_150px]`}>
            <option value="">{l('filters.agentAll')}</option>
            {(summary.data?.agents || []).map((a) => (
              <option key={a.id} value={a.id}>{a.name || l('filters.agentFallback', { id: a.id })} ({a.count})</option>
            ))}
          </select>
          {filtered && (
            <IconAction icon={FiRotateCcw} label={l('filters.reset')} tipAlign="end" onClick={() => { setFilters(EMPTY); setSearch('') }} />
          )}
        </div>

        {list.isError && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">{l('loadError')}</p>}
        {list.isLoading && <div aria-busy="true" aria-label={l('loading')} className="h-48 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" />}

        {list.data && (rows.length === 0 ? (
          <div className="grid justify-items-center gap-2 py-10 text-center">
            <p className="font-display font-bold">{l('empty.title')}</p>
            <p className="text-sm text-gray-500">{filtered ? l('empty.filtered') : l('empty.default')}</p>
            <IconAction icon={FiGrid} label={l('empty.pipelineLink')} to="/backoffice/pipeline" tone="gold" />
          </div>
        ) : (
          <div className="relative -mx-4 min-w-0 overflow-x-auto sm:-mx-5">
            <table className="w-full text-[13px]">
              <thead><tr>
                <th className={`${TH} ps-4 sm:ps-5`}>{l('columns.property')}</th>
                <th className={`${TH} hidden md:table-cell`}>{l('columns.client')}</th>
                <th className={`${TH} hidden lg:table-cell`}>{l('columns.type')}</th>
                <th className={`${TH} hidden md:table-cell`}>{l('columns.stage')}</th>
                <th className={`${TH} text-end`}>{l('columns.amount')}</th>
                <th className={`${TH} hidden sm:table-cell`}>{l('columns.status')}</th>
                <th className={`${TH} hidden xl:table-cell`}>{l('columns.agent')}</th>
                <th className={`${TH} pe-4 sm:pe-5`}><span className="sr-only">{l('columns.actions')}</span></th>
              </tr></thead>
              <tbody>
                {rows.map((tx) => {
                  const open = openId === tx.id
                  const overdue = isOverdue(tx, now)
                  const status = (
                    <>
                      <Chip tone={statusTone(tx.status)}>{t(`crm.transactions.status.${tx.status}`, { defaultValue: tx.status })}</Chip>
                      {tx.status === 'lost' && (
                        <span className="mt-1 block max-w-[10rem] text-xs text-red-700 sm:max-w-[14rem]">{tx.lost_reason || l('lostReasonNone')}</span>
                      )}
                    </>
                  )
                  return (
                    <Fragment key={tx.id}>
                      <tr className={open ? 'bg-primary-50/40' : 'hover:bg-gray-50'}>
                        <td className={`${TD} ps-4 sm:ps-5`}>
                          <p className="max-w-[9.5rem] truncate font-medium text-gray-900 sm:max-w-[18rem] xl:max-w-[22rem]">{tx.property_title || `#${tx.property_id}`}</p>
                          <p className="max-w-[9.5rem] truncate text-xs text-gray-500 sm:max-w-none">
                            <span className="font-mono">{tx.reference}</span>{tx.property_city ? ` · ${tx.property_city}` : ''}
                          </p>
                          {/* Sur mobile, le statut et le motif de perte passent sous le titre plutôt que dans une colonne. */}
                          <div className="mt-1 sm:hidden">{status}</div>
                        </td>
                        <td className={`${TD} hidden md:table-cell`}>{tx.client_name || '—'}</td>
                        <td className={`${TD} hidden lg:table-cell`}>{t(`crm.transactions.type.${tx.transaction_type}`, { defaultValue: tx.transaction_type })}</td>
                        <td className={`${TD} hidden md:table-cell`}>
                          {t(`crm.transactions.stage.${tx.stage}`, { defaultValue: tx.stage })}
                          {overdue && <span className="mt-0.5 block text-xs text-amber-700">{l('overdue')}</span>}
                        </td>
                        <td className={`${TD} whitespace-nowrap text-end font-semibold tabular-nums`}>{money(dealValue(tx), tx.transaction_type)}</td>
                        <td className={`${TD} hidden sm:table-cell`}>{status}</td>
                        <td className={`${TD} hidden whitespace-nowrap xl:table-cell`}>{tx.agent_name || '—'}</td>
                        <td className={`${TD} pe-4 sm:pe-5`}>
                          <div className="flex items-center justify-end gap-0.5">
                            <IconAction
                              id={`tx-toggle-${tx.id}`}
                              icon={FiChevronDown}
                              label={open ? l('collapse') : l('expand')}
                              onClick={() => setOpenId(open ? null : tx.id)}
                              tone="gold"
                              tipAlign="end"
                              aria-expanded={open}
                              aria-controls={`tx-fiche-${tx.id}`}
                              className={`[&>svg]:transition-transform [&>svg]:duration-200 motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''}`}
                            />
                            <IconAction icon={FiArrowUpRight} label={l('viewDetails')} to={`/backoffice/transactions/${tx.id}`} tipAlign="end" className="hidden sm:inline-flex" />
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr id={`tx-fiche-${tx.id}`} className="bg-primary-50/40">
                          <td colSpan={8} className="border-t border-primary-100 px-4 pb-4 pt-1 sm:px-5">
                            <Fiche tx={tx} overdue={overdue} />
                            <div className="mt-1 flex justify-end sm:hidden">
                              <IconAction icon={FiArrowUpRight} label={l('viewDetails')} to={`/backoffice/transactions/${tx.id}`} tone="gold" tipAlign="end" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 text-[13px] text-gray-600">
            <IconAction icon={FiChevronLeft} label={l('prev')} disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))} className="rtl:[&>svg]:rotate-180 disabled:opacity-40" />
            <span className="tabular-nums">{l('pageInfo', { page: filters.page, total: pages })}</span>
            <IconAction icon={FiChevronRight} label={l('next')} disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))} className="rtl:[&>svg]:rotate-180 disabled:opacity-40" />
          </div>
        )}
      </section>
    </div>
  )
}
