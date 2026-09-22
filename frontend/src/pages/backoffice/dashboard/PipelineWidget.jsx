import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiFileText } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailFrame, Figure, Legend, Rich, SegBar, Segmented } from '../components/kit'
import { useMoney } from '../components/kitTokens'
import { SOURCES, SOURCE_COLORS, funnelOf, periodWeeks, stageTotals, sumSources } from './model'

// Rampe or de la marque : de l'étape la plus précoce (claire) à la plus avancée (foncée).
const STAGE_RAMP = ['#E4C489', '#D6A85F', '#C6923F', '#A9781F', '#8A6218', '#6B4C12']
const BRUT = '#C3E2DD'
const POND = '#0F766E'

function MiniFunnel({ f }) {
  const { t } = useTranslation('backoffice')
  const rows = ['received', 'contacted', 'qualified', 'converted']
  return (
    <div className="grid gap-[7px]">
      {rows.map((k, i) => (
        <div key={k} className="grid grid-cols-[78px_1fr_34px] items-center gap-2 text-[12.5px]">
          <span>{t(`dashboard.pipeline.funnel.${k}`)}</span>
          <span className="h-2 overflow-hidden rounded bg-gray-100">
            <i className="block h-full rounded bg-primary-400" style={{ width: `${f.received ? (f[k] / f.received) * 100 : 0}%`, opacity: 1 - i * 0.17 }} />
          </span>
          <span className="text-end font-semibold tabular-nums">{f[k]}</span>
        </div>
      ))}
    </div>
  )
}

export function PipelineCompact({ pipeline, weekly }) {
  const { t } = useTranslation('backoffice')
  const money = useMoney()
  const sale = pipeline?.sale || []
  const rent = pipeline?.rent || []
  const s = stageTotals(sale)
  const r = stageTotals(rent)
  if (!s.count && !r.count) return <p className="text-sm text-gray-500">{t('dashboard.pipeline.empty')}</p>

  const [v, unit] = money.parts(s.weighted, 'sale')
  const finalAct = sale.find((x) => x.stage === 'final_act')
  const f = funnelOf(periodWeeks(weekly, 30).current)
  const visible = sale.filter((x) => x.weighted > 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3.5">
        <Figure value={v} unit={unit}>{t('dashboard.pipeline.weightedOf', { amount: money(s.amount, 'sale') })}</Figure>
        <div className="grid gap-2">
          <SegBar tall label={t('dashboard.pipeline.stagesLabel')}
            parts={sale.map((x, i) => ({ value: x.weighted, color: STAGE_RAMP[i] }))} />
          <div className="flex gap-0.5 text-[11.5px] text-gray-500">
            {/* Une étape trop étroite garde son segment mais pas de libellé : tronqué, il devenait illisible. */}
            {visible.map((x) => (
              <span key={x.stage} className="min-w-0 truncate" style={{ flex: x.weighted }}>
                {x.weighted / (s.weighted || 1) >= 0.12 ? t(`dashboard.stages.${x.stage}`) : ''}
              </span>
            ))}
          </div>
        </div>
        {finalAct?.count > 0 && (
          <Alert tone="info" icon={FiFileText}>
            <Rich i18nKey="dashboard.pipeline.finalActs" values={{
              count: finalAct.count, amount: money(finalAct.weighted, 'sale'),
              share: `${Math.round((finalAct.weighted / (s.weighted || 1)) * 100)} %`,
            }} />
          </Alert>
        )}
      </div>
      <div className="grid content-start gap-2.5">
        <span className="text-[12.5px] text-gray-500">{t('dashboard.pipeline.leadsLast4')}</span>
        <MiniFunnel f={f} />
        {r.count > 0 && <span className="text-[12.5px] text-gray-500">{t('dashboard.pipeline.rentLine', { count: r.count, amount: money(r.weighted, 'rent') })}</span>}
      </div>
    </div>
  )
}

function WeeklyChart({ weeks }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const [tip, setTip] = useState(null)
  const W = 520, H = 210, L = 28, R = 6, T = 18, B = 26
  const totals = weeks.map(sumSources)
  const maxV = Math.max(4, ...totals)
  const step = maxV > 10 ? 5 : 2
  const top = Math.ceil(maxV / step) * step
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const band = (W - L - R) / Math.max(1, weeks.length)
  const bw = Math.min(40, band * 0.56)
  const ticks = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  const label = (w) => fmtDate(`${w.week}T12:00:00`, { day: 'numeric', month: 'short' })

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dashboard.pipeline.weeklyLabel')} className="block h-auto w-full overflow-visible">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#EEEAE3" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-gray-500 text-[11px]">{v}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = L + band * i + band / 2
          const x = cx - bw / 2
          let acc = 0
          const segs = SOURCES.map((k) => {
            const v = w.by_source?.[k] || 0
            if (!v) return null
            const y0 = y(acc)
            acc += v
            const y1 = y(acc)
            const isTop = acc === totals[i]
            return isTop
              ? <path key={k} d={`M${x},${y0} V${y1 + 4} Q${x},${y1} ${x + 4},${y1} H${x + bw - 4} Q${x + bw},${y1} ${x + bw},${y1 + 4} V${y0} Z`} fill={SOURCE_COLORS[k]} />
              : <rect key={k} x={x} y={y1 + 2} width={bw} height={Math.max(0, y0 - y1 - 2)} fill={SOURCE_COLORS[k]} />
          })
          const show = (e) => setTip({ w, x: e.clientX, y: e.clientY })
          return (
            <g key={w.week} tabIndex={0} aria-label={`${t('dashboard.pipeline.weekOf', { date: label(w) })} : ${totals[i]}`}
              onMouseMove={show} onMouseLeave={() => setTip(null)}
              onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ w, x: r.left + r.width / 2, y: r.top }) }}
              onBlur={() => setTip(null)} className="outline-none [&:focus_.hit]:fill-gray-100 [&:hover_.hit]:fill-gray-100">
              <rect className="hit" x={cx - band / 2 + 2} y={T - 12} width={band - 4} height={H - B - T + 12} rx={6} fill="transparent" />
              {segs}
              <text x={cx} y={y(totals[i]) - 6} textAnchor="middle" className="fill-gray-600 text-[11px] font-semibold">{totals[i]}</text>
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[11px]">{label(w)}</text>
            </g>
          )
        })}
      </svg>
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-40 min-w-[160px] rounded-lg bg-gray-900 px-2.5 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 190), top: Math.max(8, tip.y - 130) }}>
          <b className="mb-1 block">{t('dashboard.pipeline.weekOf', { date: label(tip.w) })}</b>
          {SOURCES.map((k) => (
            <div key={k} className="flex justify-between gap-3.5 tabular-nums">
              <span><i className="me-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: SOURCE_COLORS[k] }} />{t(`dashboard.sources.${k}`)}</span>
              <span>{tip.w.by_source?.[k] || 0}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between font-semibold"><span>{t('dashboard.pipeline.total')}</span><span>{sumSources(tip.w)}</span></div>
        </div>
      )}
    </div>
  )
}

export function PipelineDetail({ pipeline, weekly, closed, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  const [period, setPeriod] = useState(30)
  const [type, setType] = useState('sale')

  const { current, previous } = periodWeeks(weekly, period)
  const f = funnelOf(current)
  const prev = previous ? funnelOf(previous).received : null
  const start = current.length ? new Date(`${current[0].week}T00:00:00`) : new Date()
  const stages = pipeline?.[type] || []
  const tot = stageTotals(stages)
  const maxA = Math.max(1, ...stages.map((x) => x.amount))
  const inPeriod = (closed || []).filter((c) => c.type === type && new Date(c.date) >= start)
  const won = inPeriod.filter((c) => c.status === 'won')
  const lost = inPeriod.filter((c) => c.status === 'lost')
  const wonSum = won.reduce((n, c) => n + c.amount, 0)
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '–')
  const list = (cs) => cs.map((c) => `${t(`dashboard.stages.${c.stage}`, { defaultValue: c.stage })} · ${money(c.amount, type)}`).join(', ') || t('dashboard.pipeline.noneInPeriod')
  const kpi = 'grid content-start gap-[3px] border-gray-200 px-4 py-3.5'

  return (
    <DetailFrame
      title={t('dashboard.pipeline.title')}
      sub={t('dashboard.pipeline.range', { from: fmtDate(start, { day: 'numeric', month: 'long' }), to: fmtDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' }) })}
      link={{ to: '/backoffice/pipeline', label: t('dashboard.pipeline.title') }}
      onClose={onClose}
      titleRef={titleRef}
      controls={<>
        <Segmented label={t('dashboard.pipeline.periodLabel')} value={period} onChange={setPeriod}
          options={[7, 30, 90].map((p) => ({ value: p, label: t(`dashboard.pipeline.period.p${p}`) }))} />
        <Segmented label={t('dashboard.pipeline.typeLabel')} value={type} onChange={setType}
          options={['sale', 'rent'].map((v) => ({ value: v, label: t(`dashboard.pipeline.type.${v}`) }))} />
      </>}
    >
      <div className="mb-5 grid grid-cols-2 rounded-lg border border-gray-200 lg:grid-cols-4 [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0 [&>*]:border-e [&>*:nth-child(2)]:border-e-0 lg:[&>*:nth-child(2)]:border-e [&>*:last-child]:border-e-0">
        <div className={kpi}>
          <span className="text-xs font-medium text-gray-500">{t('dashboard.pipeline.kpi.leads')}</span>
          <span className="font-display text-[22px] font-extrabold tabular-nums">{f.received}</span>
          <span className="text-xs text-gray-500">
            {prev === null ? t('dashboard.pipeline.noPrevious') : <>
              {prev > 0 && <span className={`font-semibold ${f.received >= prev ? 'text-green-700' : 'text-red-700'}`}>{f.received >= prev ? '+' : '−'}{pct(Math.abs(f.received - prev), prev)} </span>}
              {t('dashboard.pipeline.vsPrevious', { count: prev })}
            </>}
          </span>
        </div>
        <div className={kpi}>
          <span className="text-xs font-medium text-gray-500">{t('dashboard.pipeline.kpi.conversion')}</span>
          <span className="font-display text-[22px] font-extrabold tabular-nums">{pct(f.converted, f.received)}</span>
          <span className="text-xs text-gray-500">{t('dashboard.pipeline.convertedLost', { converted: f.converted, lost: f.lost })}</span>
        </div>
        <div className={kpi}>
          <span className="text-xs font-medium text-gray-500">{t('dashboard.pipeline.kpi.weighted')} <Chip tone="gold">{t('dashboard.pipeline.kpi.asOf')}</Chip></span>
          <span className="font-display text-[22px] font-extrabold tabular-nums">{money.parts(tot.weighted, type)[0]}<small className="ms-1 text-[12.5px] font-bold text-gray-600">{money.parts(tot.weighted, type)[1]}</small></span>
          <span className="text-xs text-gray-500">{t('dashboard.pipeline.ofFiles', { amount: money(tot.amount, type), count: tot.count })}</span>
        </div>
        <div className={kpi}>
          <span className="text-xs font-medium text-gray-500">{t('dashboard.pipeline.kpi.signed')}</span>
          <span className="font-display text-[22px] font-extrabold tabular-nums">{won.length ? money(wonSum, type) : 0}</span>
          <span className="text-xs text-gray-500">{t('dashboard.pipeline.wonLost', { won: won.length, lost: lost.length })}</span>
        </div>
      </div>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
            <h3 className="font-display text-[13.5px] font-bold">{t('dashboard.pipeline.weeklyTitle')}</h3>
            <Legend items={SOURCES.map((k) => ({ color: SOURCE_COLORS[k], label: t(`dashboard.sources.${k}`) }))} />
          </div>
          <WeeklyChart weeks={current} />
        </div>
        <div>
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
            <h3 className="font-display text-[13.5px] font-bold">{t('dashboard.pipeline.funnelTitle')}</h3>
            <span className="text-xs text-gray-500">{t('dashboard.pipeline.funnelNote')}</span>
          </div>
          <div className="grid gap-2">
            {['received', 'contacted', 'qualified', 'converted'].map((k, i, arr) => (
              <div key={k}>
                {i > 0 && <div className="mb-1 ps-[94px] text-[11.5px] text-gray-500">{t('dashboard.pipeline.fromPrevious', { share: pct(f[k], f[arr[i - 1]]) })}</div>}
                <div className="grid grid-cols-[84px_1fr] items-center gap-2.5">
                  <span className="text-[13px] text-gray-600">{t(`dashboard.pipeline.funnel.${k}`)}</span>
                  <div className="relative h-7 overflow-hidden rounded-md bg-gray-100">
                    <div className="absolute inset-y-0 start-0 rounded-md bg-primary-400" style={{ width: `${f.received ? (f[k] / f.received) * 100 : 0}%`, opacity: 1 - i * 0.18 }} />
                    <div className="absolute inset-y-0 start-2.5 flex items-center gap-2 font-semibold">
                      {f[k]}<em className="text-xs font-medium not-italic text-gray-600">{pct(f[k], f.received)}</em>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-dashed border-gray-200 pt-3 text-[12.5px] text-gray-600">
              <Chip tone="crit">{f.lost}</Chip>{t('dashboard.pipeline.lostOut', { count: f.lost })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-1">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
          <h3 className="font-display text-[13.5px] font-bold">{t('dashboard.pipeline.stagesTitle')} <Chip tone="gold">{t('dashboard.pipeline.kpi.asOf')}</Chip></h3>
          <Legend items={[{ color: BRUT, label: t('dashboard.pipeline.amountTotal') }, { color: POND, label: t('dashboard.pipeline.amountWeighted') }]} />
        </div>
        {stages.map((x) => (
          <div key={x.stage} className="-mx-1.5 grid grid-cols-[100px_1fr] items-center gap-3.5 rounded-lg px-1.5 py-1 hover:bg-gray-50 sm:grid-cols-[120px_1fr_150px]">
            <div className="flex justify-between gap-2 font-medium">{t(`dashboard.stages.${x.stage}`)}<span className="text-gray-500">{x.count}</span></div>
            <div className="relative h-4">
              {x.amount > 0 && <>
                <div className="absolute inset-y-0 start-0 rounded-e" style={{ width: `${(x.amount / maxA) * 100}%`, background: BRUT }} />
                <div className="absolute inset-y-1 start-0 rounded-e" style={{ width: `${(x.weighted / maxA) * 100}%`, background: POND }} />
              </>}
            </div>
            <div className="col-span-2 flex gap-2 tabular-nums sm:col-span-1 sm:block sm:text-end">
              {x.amount > 0
                ? <><b className="font-semibold">{money(x.weighted, type)}</b><span className="text-xs text-gray-500 sm:block">{t('dashboard.pipeline.outOf', { amount: money(x.amount, type) })}</span></>
                : <span className="text-xs text-gray-500">{t('dashboard.pipeline.noFile')}</span>}
            </div>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 pt-3 text-[12.5px] text-gray-600">
          <Chip tone="good">{t('dashboard.pipeline.wonChip', { count: won.length })}</Chip><span>{list(won)}</span>
          <Chip tone="crit">{t('dashboard.pipeline.lostChip', { count: lost.length })}</Chip><span>{list(lost)}</span>
        </div>
      </div>
    </DetailFrame>
  )
}
