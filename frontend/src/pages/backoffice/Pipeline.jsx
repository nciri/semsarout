import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiChevronDown, FiColumns, FiEye, FiList, FiPlus, FiSearch, FiUser, FiUsers } from 'react-icons/fi'
import api from '../../services/api'
import { useFormat } from '../../utils/format'
import { Chip, IconAction, Legend, Rich, Segmented } from './components/kit'
import { useMoney } from './components/kitTokens'
import Board from './pipeline/Board'
import { P, useFlagText } from './pipeline/flagText'
import {
  agentLoad, daysInStage, flatten, isActionable, longestIdle, matches, moveInPipeline, outcomes, todoItems, totals,
} from './pipeline/model'

const fetchPipeline = async (type) => (await api.get(`/backoffice/transactions/pipeline?${new URLSearchParams({ type })}`)).data
const BRUT = '#C3E2DD'
const POND = '#0F766E'
const TODO_LIMIT = 4
const STORE = 'pipe-view'

function readType() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}').type === 'rent' ? 'rent' : 'sale' } catch { return 'sale' }
}
function writeType(type) { try { localStorage.setItem(STORE, JSON.stringify({ type })) } catch { /* stockage indisponible */ } }

function Kpis({ rows, type, closed, now }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const money = useMoney()
  const tot = totals(rows)
  const todo = rows.filter(isActionable)
  const crit = todo.filter((x) => (x.flags || []).some((f) => f.severity === 'crit'))
  const idle = longestIdle(rows, now)
  const out = closed ? outcomes(closed) : null
  const [pv, pu] = money.parts(tot.weighted, type)
  const cell = 'grid min-w-0 content-start gap-[3px] border-gray-200 px-3.5 py-3 sm:px-[18px] sm:py-3.5'
  const val = 'font-display text-[19px] font-extrabold tabular-nums sm:text-[22px]'
  const unit = 'ms-[3px] text-[12.5px] font-bold text-gray-600'
  const lbl = 'text-xs font-medium text-gray-500'
  const sub = 'text-xs text-gray-500'

  return (
    <div aria-live="polite" className="grid grid-cols-2 rounded-[10px] border border-gray-200 bg-white lg:grid-cols-4 [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0 [&>*]:border-e [&>*:nth-child(2)]:border-e-0 lg:[&>*:nth-child(2)]:border-e [&>*:last-child]:border-e-0">
      <div className={cell}>
        <span className={lbl}>{t('kpi.weighted')} <Chip tone="gold">{t('kpi.asOf')}</Chip></span>
        <span className={val}>{pv}<small className={unit}>{pu}</small></span>
        <span className={sub}>
          {t('kpi.weightedSub', { amount: money(tot.gross, type), count: tot.count })}
          {type === 'sale' && tot.commission > 0 && t('kpi.commission', { amount: money(tot.commission, type) })}
        </span>
      </div>
      <div className={cell}>
        <span className={lbl}>{t('kpi.todo')}</span>
        <span className={val}>{todo.length}</span>
        <span className={sub}>
          {todo.length ? <>
            {crit.length > 0 && <><span className="font-semibold text-red-700">{t('kpi.critical', { count: crit.length })}</span> · </>}
            {t('kpi.todoShare', { share: `${Math.round((todo.length / rows.length) * 100)} %` })}
          </> : t('kpi.nothingBlocking')}
        </span>
      </div>
      <div className={cell}>
        <span className={lbl}>{t('kpi.idle')}</span>
        <span className={val}>{idle ? <>{daysInStage(idle, now)}<small className={unit}>{t('kpi.days', { count: daysInStage(idle, now) })}</small></> : '–'}</span>
        {idle && <span className={`${sub} truncate`}>{t(`stages.${idle.stage}`)} · {idle.property_title || t('card.noPropertyTitle')}</span>}
      </div>
      <div className={cell}>
        <span className={lbl}>{t('kpi.exits')}</span>
        {out ? <>
          <span className={val}>
            {out.won}<small className={unit}>{t('kpi.won', { count: out.won })}</small> · {out.lost}<small className={unit}>{t('kpi.lost', { count: out.lost })}</small>
          </span>
          <span className={sub}>
            {out.biggestLost
              ? <>{t('kpi.lostSub', { amount: money(out.lostSum, type), top: money(out.biggestLost.amount, type), stage: t(`stages.${out.biggestLost.stage}`, { defaultValue: out.biggestLost.stage }).toLocaleLowerCase() })}{out.biggestLost.lost_reason && t('kpi.lostReason', { reason: out.biggestLost.lost_reason })}</>
              : t('kpi.noLoss')}
          </span>
        </> : <><span className={val}>–</span><span className={sub}>{t('kpi.unavailable')}</span></>}
      </div>
    </div>
  )
}

function Todo({ rows, type, now, onGo }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const flagText = useFlagText(type)
  const [open, setOpen] = useState(false)
  const items = todoItems(rows, now)
  const tone = { crit: 'crit', warn: 'warn', info: 'neutral' }

  return (
    <section aria-labelledby="h-todo" className="grid min-w-0 content-start gap-3.5 rounded-xl border border-gray-200 bg-white p-4 sm:px-5 sm:py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="h-todo" className="flex items-center gap-2 font-display text-[14.5px] font-bold">
          <FiAlertTriangle className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{t('todo.title')}
        </h2>
        {items.length > TODO_LIMIT && (
          <IconAction icon={FiChevronDown} tone="gold" tipAlign="end" onClick={() => setOpen((o) => !o)}
            label={open ? t('todo.less') : t('todo.more', { count: items.length - TODO_LIMIT })}
            aria-expanded={open} aria-controls="pipe-todo"
            className={`-m-2 [&>svg]:transition-transform motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''}`} />
        )}
      </div>
      <ul id="pipe-todo" className="grid">
        {items.length ? items.map(({ t: x, f }, i) => {
          const { title, text } = flagText(f)
          return (
            // Classe et non attribut `hidden` : la classe `grid` l'emporterait sur lui.
            <li key={`${x.id}-${f.code}`}
              className={`${i >= TODO_LIMIT && !open ? 'hidden' : 'grid'} grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 border-t border-gray-100 py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]`}>
              <span className="row-span-2 mt-px"><Chip tone={tone[f.severity]}>{t(`todo.severity.${f.severity}`)}</Chip></span>
              <span>
                <b className="font-semibold">{title}</b>
                <span className="block text-xs text-gray-500">{[x.reference, x.client_name, x.agent_name].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="col-start-2 text-[12.5px] text-gray-600">{text}</span>
              <span className="col-start-2 -ms-2 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:ms-0 sm:self-center">
                <IconAction icon={FiEye} tone="gold" tipAlign="end" label={t('todo.goTo', { ref: x.reference })} onClick={() => onGo(x.id)} />
              </span>
            </li>
          )
        }) : (
          <li className="flex items-center gap-3"><Chip tone="good">{t('todo.none')}</Chip><b className="font-semibold">{t('todo.empty')}</b></li>
        )}
      </ul>
    </section>
  )
}

function Agents({ rows, type, agent, onPick }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const money = useMoney()
  const [tip, setTip] = useState(null)
  const load = agentLoad(rows)
  const max = Math.max(1, ...load.map((a) => a.gross))
  const name = (a) => a.name || t('agents.unassigned')

  return (
    <section aria-labelledby="h-agents" className="grid min-w-0 content-start gap-3.5 rounded-xl border border-gray-200 bg-white p-4 sm:px-5 sm:py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="h-agents" className="flex items-center gap-2 font-display text-[14.5px] font-bold">
          <FiUsers className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{t('agents.title')}
        </h2>
        <Legend items={[{ color: BRUT, label: t('agents.gross') }, { color: POND, label: t('agents.weighted') }]} />
      </div>
      <div className="grid gap-1">
        {load.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={String(agent) === String(a.id)}
            aria-label={t('agents.rowLabel', { name: name(a), count: a.count, weighted: money(a.weighted, type), gross: money(a.gross, type), todo: a.todo })}
            onClick={() => { setTip(null); onPick(String(agent) === String(a.id) ? '' : String(a.id)) }}
            onMouseMove={(e) => setTip({ a, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ a, x: r.left + r.width / 2, y: r.top }) }}
            onBlur={() => setTip(null)}
            className="-mx-1.5 grid grid-cols-[96px_1fr_80px] items-center gap-2 rounded-lg px-1.5 py-[5px] text-start hover:bg-gray-50 aria-pressed:bg-gray-100 sm:grid-cols-[118px_1fr_92px] sm:gap-3"
          >
            <span className="flex min-w-0 justify-between gap-1.5 text-[13px] font-medium"><span className="truncate">{name(a)}</span><span className="text-gray-500">{a.count}</span></span>
            <span className="relative h-4">
              <span className="absolute inset-y-0 start-0 rounded-e" style={{ width: `${(a.gross / max) * 100}%`, background: BRUT }} />
              <span className="absolute inset-y-1 start-0 rounded-e" style={{ width: `${(a.weighted / max) * 100}%`, background: POND }} />
            </span>
            <span className="text-end text-[13px] tabular-nums">
              <b className="font-semibold">{money(a.weighted, type)}</b>
              <span className={`block text-[11.5px] ${a.todo ? 'font-semibold text-red-700' : 'text-gray-500'}`}>{a.todo ? t('agents.todoCount', { count: a.todo }) : t('agents.nothing')}</span>
            </span>
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-500">{t('agents.hint')}</span>
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-40 min-w-[170px] rounded-lg bg-gray-900 px-2.5 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 190)), top: Math.max(8, tip.y - 110) }}>
          <b className="mb-1 block">{name(tip.a)}</b>
          {[[t('agents.files'), tip.a.count], [t('agents.gross'), money(tip.a.gross, type), BRUT], [t('agents.weighted'), money(tip.a.weighted, type), POND], [t('agents.todo'), tip.a.todo]].map(([k, v, c]) => (
            <div key={k} className="flex justify-between gap-3.5 tabular-nums">
              <span>{c && <i className="me-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: c }} />}{k}</span><span>{v}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function BackofficePipeline() {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtDate } = useFormat()
  const queryClient = useQueryClient()
  const [type, setType] = useState(readType)
  const [agent, setAgent] = useState('')
  const [onlyTodo, setOnlyTodo] = useState(false)
  const [q, setQ] = useState('')
  const [openIds, setOpenIds] = useState(() => new Set())
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState(null)
  const cardRefs = useRef({})
  const toastTimer = useRef(null)
  const now = new Date()
  const key = ['backoffice-pipeline', type]

  const { data, isLoading, isError } = useQuery(key, () => fetchPipeline(type), { keepPreviousData: true })
  const stages = data?.stages || []
  const all = flatten(data?.pipeline)
  const agentIds = [...new Set(all.map((x) => String(x.agent_id ?? 0)))]
  const scoped = agent && agentIds.includes(agent) ? all.filter((x) => String(x.agent_id ?? 0) === agent) : all
  const filter = { q, onlyTodo }

  useEffect(() => { writeType(type) }, [type])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // La carte ciblée (depuis « à traiter » ou après un déplacement) est amenée à l'écran et reçoit le focus.
  useEffect(() => {
    if (!flash) return undefined
    const el = cardRefs.current[flash.id]
    if (el) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      el.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' })
      el.querySelector('[data-expand]')?.focus({ preventScroll: true })
    }
    const id = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(id)
  }, [flash])

  const move = useMutation(({ id, stage, enteredAt }) => api.post(`/backoffice/transactions/${id}/move`, { stage, order: 0, ...(enteredAt && { stage_entered_at: enteredAt }) }), {
    onSettled: () => queryClient.invalidateQueries('backoffice-pipeline'),
  })
  const archive = useMutation((id) => api.delete(`/backoffice/transactions/${id}`), {
    onSuccess: () => queryClient.invalidateQueries('backoffice-pipeline'),
  })

  const showToast = (content) => {
    setToast(content)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  const doMove = (id, stage, restore) => {
    // Lu dans le cache et non dans le rendu : « Annuler » s'exécute après le déplacement optimiste.
    const previous = queryClient.getQueryData(key)
    const card = flatten(previous?.pipeline).find((x) => x.id === id)
    if (!card || card.stage === stage) return
    const enteredAt = restore?.enteredAt || new Date().toISOString()
    queryClient.setQueryData(key, (d) => moveInPipeline(d, id, stage, enteredAt, restore ? restore.days : 0))
    setFlash({ id })
    move.mutate({ id, stage, enteredAt: restore?.enteredAt }, {
      onError: () => {
        queryClient.setQueryData(key, previous)
        showToast({ text: t('move.failed', { ref: card.reference, stage: t(`stages.${card.stage}`) }) })
      },
    })
    if (restore) { setToast(null); return }
    const back = { enteredAt: card.stage_entered_at || card.created_at, days: daysInStage(card, now) }
    showToast({
      rich: { i18nKey: `${P}.move.done`, values: { ref: card.reference, stage: t(`stages.${stage}`), probability: card.probability ?? 0 } },
      undo: () => doMove(id, card.stage, back),
    })
  }

  const doArchive = (tx) => {
    if (window.confirm(t('card.archiveConfirm', { ref: tx.reference }))) archive.mutate(tx.id)
  }

  const toggle = (id) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const focusCard = (id) => {
    const x = all.find((c) => c.id === id)
    if (!x) return
    if (agent && String(x.agent_id ?? 0) !== agent) setAgent('')
    if (!matches(x, filter)) { setOnlyTodo(false); setQ('') }
    setOpenIds((s) => new Set(s).add(id))
    setFlash({ id, n: Date.now() })
  }

  const what = t(type === 'sale' ? 'list.whatSale' : 'list.whatRent', { count: scoped.length })

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('list.pageTitle')}</h1>
          <p className="mt-1 text-gray-500">{t('list.subtitle', { date: fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), what })}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <IconAction icon={FiList} label={t('list.listViewLink')} to="/backoffice/transactions" className="border border-gray-200 bg-white" />
          <IconAction icon={FiPlus} label={t('list.newButton')} to="/backoffice/transactions/nouveau" tone="primary" tipAlign="end" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented label={t('list.typeLabel')} value={type} onChange={(v) => { setType(v); setAgent('') }}
          options={[{ value: 'sale', label: t('list.typeSale') }, { value: 'rent', label: t('list.typeRent') }]} />
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white ps-2.5 pe-2 text-gray-500">
          <FiUser className="h-[15px] w-[15px]" aria-hidden="true" />
          <select value={agentIds.includes(agent) ? agent : ''} onChange={(e) => setAgent(e.target.value)} aria-label={t('list.agentFilter')}
            className="cursor-pointer border-0 bg-transparent py-1.5 ps-0.5 pe-7 text-[13px] text-gray-900 focus:ring-0">
            <option value="">{t('list.agentPlaceholder')}</option>
            {agentLoad(all).map((a) => <option key={a.id} value={String(a.id)}>{a.name || t('agents.unassigned')}</option>)}
          </select>
        </label>
        <Segmented label={t('list.showLabel')} value={onlyTodo} onChange={setOnlyTodo}
          options={[{ value: false, label: t('list.showAll') }, { value: true, label: t('list.showTodo') }]} />
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 text-gray-500 sm:max-w-[320px]">
          <FiSearch className="h-[15px] w-[15px] flex-none" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('list.searchLabel')} placeholder={t('list.searchPlaceholder')}
            className="w-full min-w-0 border-0 bg-transparent px-0 py-1.5 text-[13px] text-gray-900 focus:ring-0" />
        </label>
        <span className="basis-full text-xs text-gray-500 xl:ms-auto xl:basis-auto">{t('list.amountNote')}</span>
      </div>

      {isError && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{t('list.loadError')}</p>}
      {isLoading && <div aria-busy="true" aria-label={t('list.loading')} className="h-96 animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none" />}

      {data && <>
        <Kpis rows={scoped} type={type} closed={data.closed_recent} now={now} />
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Todo rows={scoped} type={type} now={now} onGo={focusCard} />
          <Agents rows={all} type={type} agent={agent} onPick={setAgent} />
        </div>
        <section aria-labelledby="h-board" className="grid min-w-0 gap-3.5 rounded-xl border border-gray-200 bg-white px-3 py-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-2">
            <h2 id="h-board" className="flex items-center gap-2 font-display text-[14.5px] font-bold">
              <FiColumns className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{t('board.title')}
            </h2>
            <span className="text-[12.5px] text-gray-500">{t('board.hint')}</span>
          </div>
          <Board stages={stages} rows={scoped} type={type} now={now} filter={filter} openIds={openIds} flashId={flash?.id}
            onToggle={toggle} onMove={doMove} onArchive={doArchive} cardRefs={cardRefs} />
        </section>
      </>}

      {toast && (
        <div role="status" className="fixed bottom-5 start-1/2 z-50 flex max-w-[min(520px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-[10px] bg-gray-900 px-3.5 py-2.5 text-[13px] text-white shadow-[0_12px_30px_-10px_rgba(0,0,0,.4)] rtl:translate-x-1/2">
          <span>{toast.rich ? <Rich i18nKey={toast.rich.i18nKey} values={toast.rich.values} /> : toast.text}</span>
          {toast.undo && <button type="button" onClick={toast.undo} className="whitespace-nowrap rounded px-1 py-0.5 font-semibold text-primary-100 hover:bg-white/10">{t('move.undo')}</button>}
        </div>
      )}
    </div>
  )
}
