import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiAlertCircle, FiAlertTriangle, FiArchive, FiChevronDown, FiEdit2, FiExternalLink, FiFlag, FiInfo, FiMove,
} from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, IconAction } from '../components/kit'
import { useMoney } from '../components/kitTokens'
import { P, useFlagText } from './flagText'
import { amountOf, daysInStage, flagsOf, idleTone, initials, laneTotals, matches, topSeverity } from './model'

const DAY = 86400000
const SEV_ICON = { crit: FiAlertCircle, warn: FiAlertTriangle, info: FiInfo }
const SEV_ALERT = { crit: 'crit', warn: 'warn', info: 'plain' }

function Card({ tx, type, now, open, flash, onToggle, onMove, onArchive, stages, cardRef }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const { fmtDate, fmtNumber } = useFormat()
  const money = useMoney()
  const flagText = useFlagText(type)
  const flags = flagsOf(tx)
  const sev = topSeverity(tx)
  const days = daysInStage(tx, now)
  const amount = amountOf(tx)
  const gap = tx.offer_price && tx.asking_price ? (tx.asking_price - tx.offer_price) / tx.asking_price : null
  const toClose = tx.expected_closing_date ? Math.round((new Date(tx.expected_closing_date) - now) / DAY) : null
  const since = tx.stage_entered_at || tx.created_at
  const ref = tx.reference
  const SevIcon = sev === 'crit' || sev === 'warn' ? SEV_ICON[sev] : null
  const prio = tx.priority === 'urgent' ? 'text-red-700' : tx.priority === 'high' ? 'text-amber-700' : ''
  const border = sev === 'crit' ? 'border-[#EFB8B2]' : sev === 'warn' ? 'border-[#F1D2AE]' : 'border-gray-200'
  const kv = 'flex flex-wrap justify-between gap-x-2'

  return (
    <article
      ref={cardRef}
      data-id={tx.id}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(tx.id)); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('opacity-50') }}
      onDragEnd={(e) => e.currentTarget.classList.remove('opacity-50')}
      aria-label={t('card.label', { ref, client: tx.client_name || t('card.noClient'), amount: money(amount, type), probability: tx.probability ?? 0 })}
      className={`grid min-w-0 cursor-grab grid-cols-[minmax(0,1fr)] gap-[5px] rounded-[10px] border bg-white px-[11px] py-2.5 shadow-[0_1px_2px_rgba(11,18,32,.04)] transition-shadow hover:shadow-[0_6px_16px_-10px_rgba(11,18,32,.35)] motion-reduce:transition-none ${flash ? 'border-primary-400 shadow-[0_0_0_3px] shadow-primary-400' : border}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <Link to={`/backoffice/transactions/${tx.id}`} target="_blank" rel="noopener noreferrer" title={t('card.openDetail')}
          className="min-w-0 truncate font-mono text-[11.5px] font-medium text-primary-700 hover:underline">{ref}</Link>
        <span className={`me-auto inline-flex flex-none ${sev === 'crit' ? 'text-red-700' : 'text-amber-700'}`}>
          {SevIcon && <SevIcon className="h-[15px] w-[15px]" role="img" aria-label={flags.map((f) => flagText(f).title).join(' · ')} />}
        </span>
        <span className="flex-none" title={t('card.idle', { count: days })}><Chip tone={idleTone(days)}>{t('card.idleShort', { count: days })}</Chip></span>
      </div>
      <span className="truncate text-[13.5px] font-semibold">{tx.client_name || t('card.noClient')}</span>
      <span className="truncate text-xs text-gray-500" title={tx.property_title || ''}>
        {[tx.property_title || t('card.noPropertyTitle'), tx.property_city].filter(Boolean).join(' · ')}
      </span>
      <div className="flex items-baseline justify-between gap-1.5 tabular-nums">
        <b className="text-sm font-bold">{money(amount, type)}</b>
        <span className="text-xs font-semibold text-gray-600">{tx.probability ?? 0} %</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-sm bg-gray-100" aria-hidden="true">
        <i className="block h-full bg-[#0F766E]" style={{ width: `${Math.min(100, tx.probability || 0)}%` }} />
      </div>
      <div className="flex items-center gap-1.5 border-t border-gray-100 pt-1.5 text-xs text-gray-500">
        <span title={tx.agent_name || ''} className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
          {initials(tx.agent_name || '') || '·'}
        </span>
        <span className={`inline-flex items-center gap-[3px] ${prio ? `font-semibold ${prio}` : ''}`}>
          {prio && <FiFlag className="h-3 w-3" aria-hidden="true" />}
          {t(`priority.${tx.priority in { low: 1, medium: 1, high: 1, urgent: 1 } ? tx.priority : 'medium'}`)}
        </span>
        <IconAction
          icon={FiChevronDown}
          label={open ? t('card.collapse', { ref }) : t('card.expand', { ref })}
          onClick={onToggle}
          tipAlign="end"
          aria-expanded={open}
          aria-controls={`det-${tx.id}`}
          data-expand
          className={`-my-1 -me-1.5 ms-auto !p-1 [&>svg]:transition-transform motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''}`}
        />
      </div>
      <div id={`det-${tx.id}`} className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="grid min-h-0 gap-2 overflow-hidden" inert={open ? undefined : ''}>
          <div className="mt-1 grid gap-[3px] text-xs">
            <span className={kv}><span className="text-gray-500">{t('card.askingPrice')}</span><span className="font-semibold tabular-nums">{tx.asking_price != null ? money(tx.asking_price, type) : '—'}</span></span>
            <span className={kv}>
              <span className="text-gray-500">{t('card.offer')}</span>
              <span className="font-semibold tabular-nums">{tx.offer_price != null ? money(tx.offer_price, type) : '—'}</span>
              {gap !== null && <span className="basis-full text-end text-gray-500">{t('card.belowAsking', { share: `${fmtNumber(gap * 100, { maximumFractionDigits: 1 })} %` })}</span>}
            </span>
            <span className={kv}>
              <span className="text-gray-500">{t('card.expectedClose')}</span>
              <span className="font-semibold tabular-nums">{tx.expected_closing_date ? fmtDate(tx.expected_closing_date, { day: 'numeric', month: 'long' }) : '—'}</span>
              {toClose !== null && <span className="basis-full text-end text-gray-500">{toClose >= 0 ? t('card.inDays', { count: toClose }) : t('card.daysAgo', { count: -toClose })}</span>}
            </span>
            <span className={kv}><span className="text-gray-500">{t('card.inStageSince')}</span><span className="font-semibold tabular-nums">{since ? fmtDate(since, { day: 'numeric', month: 'long' }) : '—'}</span></span>
            {type === 'sale' && tx.commission_rate != null && (
              <span className={kv}>
                <span className="text-gray-500">{t('card.commission', { rate: fmtNumber(tx.commission_rate, { maximumFractionDigits: 1 }) })}</span>
                <span className="font-semibold tabular-nums">{money((amount * tx.commission_rate) / 100, type)}</span>
              </span>
            )}
            <span className={kv}><span className="text-gray-500">{t('card.agentLabel')}</span><span className="font-semibold">{tx.agent_name || '—'}</span></span>
          </div>
          {flags.map((f, i) => {
            const { title, text } = flagText(f)
            return <Alert key={i} tone={SEV_ALERT[f.severity]} icon={SEV_ICON[f.severity]}><b className="font-semibold">{title}.</b> {text}</Alert>
          })}
          <label className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white ps-2.5 pe-2 text-gray-500">
            <FiMove className="h-[15px] w-[15px] flex-none" aria-hidden="true" />
            <select
              value={tx.stage}
              onChange={(e) => onMove(tx.id, e.target.value)}
              aria-label={t('card.moveLabel', { ref })}
              className="w-full cursor-pointer border-0 bg-transparent py-1.5 ps-0.5 text-[12.5px] text-gray-900 focus:ring-0"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === tx.stage ? t('card.currentStage', { stage: t(`stages.${s.id}`) }) : t('card.moveTo', { stage: t(`stages.${s.id}`) })}
                </option>
              ))}
            </select>
          </label>
          <div className="-mx-1.5 flex flex-wrap gap-1">
            <IconAction icon={FiExternalLink} label={t('card.openDetail')} to={`/backoffice/transactions/${tx.id}`} target="_blank" rel="noopener noreferrer" tone="gold" />
            <IconAction icon={FiEdit2} label={t('card.edit')} to={`/backoffice/transactions/${tx.id}`} />
            <IconAction icon={FiArchive} label={t('card.archive')} onClick={() => onArchive(tx)} tone="danger" />
          </div>
        </div>
      </div>
    </article>
  )
}

export default function Board({ stages, rows, type, now, filter, openIds, flashId, onToggle, onMove, onArchive, cardRefs }) {
  const { t } = useTranslation('backoffice', { keyPrefix: P })
  const money = useMoney()
  const [over, setOver] = useState(null)
  const lanes = laneTotals(stages, rows)
  const maxW = Math.max(1, ...lanes.map((l) => l.weighted))

  return (
    <div className="-mx-0.5 overflow-x-auto px-0.5 pb-1.5 [scroll-snap-type:x_proximity]">
      <div className="grid min-w-min auto-cols-[236px] grid-flow-col gap-2.5 lg:auto-cols-[minmax(170px,1fr)]">
        {lanes.map((l) => {
          const visible = l.rows.filter((x) => matches(x, filter))
          const [pv, pu] = money.parts(l.weighted, type)
          const label = t(`stages.${l.id}`)
          return (
            <section
              key={l.id}
              aria-label={t('board.laneLabel', { stage: label, count: l.rows.length })}
              onDragOver={(e) => { e.preventDefault(); setOver(l.id) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null) }}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id) onMove(id, l.id) }}
              className={`flex min-h-[320px] flex-col rounded-xl [scroll-snap-align:start] transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none ${over === l.id ? 'bg-primary-50 shadow-[inset_0_0_0_2px] shadow-primary-400' : 'bg-[#EFECE6]'}`}
            >
              <div className="grid gap-1 px-3 pb-2.5 pt-3">
                <div className="flex items-center justify-between gap-1.5">
                  <h3 className="font-display text-[13.5px] font-bold">{label}</h3>
                  <span className="rounded-full bg-white px-2 text-xs font-semibold leading-5 text-gray-600">{l.rows.length}</span>
                </div>
                {l.rows.length ? <>
                  <span className="font-display text-base font-extrabold tabular-nums">{pv}<small className="ms-0.5 text-[11.5px] font-bold text-gray-600">{pu}</small></span>
                  <span className="text-[11.5px] text-gray-500">{t('board.weightedOf', { amount: money(l.gross, type) })}</span>
                </> : <span className="text-[11.5px] text-gray-500">{t('board.noFile')}</span>}
                <div className="mt-0.5 h-1 overflow-hidden rounded-sm bg-[rgba(11,18,32,.06)]" aria-hidden="true">
                  <i className="block h-full rounded-sm bg-primary-600" style={{ width: `${(l.weighted / maxW) * 100}%` }} />
                </div>
              </div>
              <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-2 px-2 pb-2">
                {visible.map((x) => (
                  <Card key={x.id} tx={x} type={type} now={now} stages={stages}
                    open={openIds.has(x.id)} flash={flashId === x.id}
                    onToggle={() => onToggle(x.id)} onMove={onMove} onArchive={onArchive}
                    cardRef={(el) => { cardRefs.current[x.id] = el }} />
                ))}
                {!visible.length && (
                  <div className="rounded-[10px] border-[1.5px] border-dashed border-[#D9D5CD] px-2.5 py-[18px] text-center text-[12.5px] text-gray-500">
                    {l.rows.length ? t('board.hiddenByFilter') : t('board.dropHere')}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
