import { useTranslation } from 'react-i18next'
import { FiChevronRight } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Legend } from '../components/kit'
import { TONE_COLORS } from '../components/kitTokens'
import { MAX_RATIO, xPct } from './model'
import { B, useFullMoney } from './hooks'

const COLS = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 sm:grid-cols-[190px_minmax(0,1fr)_92px]'

export function RangeLegend() {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.price` })
  return <Legend items={[
    { color: '#C3E2DD', label: t('legendBand') },
    { color: '#0F766E', label: t('legendAvg') },
    { color: '#0B1220', label: t('legendPoint') },
  ]} />
}

/** Échelle commune : 0 à 200 % du prix moyen au m² du quartier. */
export function RangeAxis({ name }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.price` })
  const ticks = [[0, '0'], [25, '50 %'], [50, t('axisAvg')], [75, '150 %'], [100, '200 %']]
  return (
    <div aria-hidden="true" className={`${COLS} px-1.5 text-[11px] text-gray-500`}>
      <span className="hidden sm:block">{name}</span>
      <div className="relative col-span-2 h-3.5 sm:col-span-1">
        {ticks.map(([x, l], i) => (
          <span key={x} className={`absolute whitespace-nowrap ${i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full rtl:translate-x-full' : '-translate-x-1/2 rtl:translate-x-1/2'}`} style={{ insetInlineStart: `${x}%` }}>{l}</span>
        ))}
      </div>
      <span className="hidden text-end sm:block">{t('axisGap')}</span>
    </div>
  )
}

/** Une annonce : bande de la fourchette, trait de la moyenne, point du prix (flèche au-delà de 200 %). */
export function RangeRow({ row, name, sub }) {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.price` })
  const { fmtNumber } = useFormat()
  const money = useFullMoney()
  const { ratio, pos, ref, sqm } = row.market
  const tone = pos === 'above' ? 'crit' : pos === 'below' ? 'warn' : null
  const gap = ratio > MAX_RATIO ? `× ${fmtNumber(ratio, { maximumFractionDigits: 1 })}`
    : `${ratio >= 1 ? '+' : '−'}${Math.round(Math.abs(ratio - 1) * 100)} %`
  const lo = xPct(ref.min / ref.avg)
  const hi = xPct(ref.max / ref.avg)
  const label = t('rowLabel', { name, value: money.sqm(row, sqm), min: fmtNumber(ref.min), max: fmtNumber(ref.max) })
  return (
    <div tabIndex={0} aria-label={label} className={`group relative items-center rounded-lg px-1.5 py-1 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${COLS}`}>
      <span className="min-w-0 truncate font-medium">{name}{sub && <span className="block truncate text-xs font-normal text-gray-500">{sub}</span>}</span>
      <div className="relative col-span-2 row-start-2 h-[22px] sm:col-span-1 sm:row-start-auto">
        <span className="absolute inset-x-0 top-2.5 h-0.5 rounded bg-gray-200" />
        <span className="absolute top-[5px] h-3 rounded bg-[#C3E2DD]" style={{ insetInlineStart: `${lo}%`, width: `${hi - lo}%` }} />
        <span className="absolute top-0.5 h-[18px] w-0.5 -ms-px bg-[#0F766E]" style={{ insetInlineStart: '50%' }} />
        {ratio > MAX_RATIO
          ? <FiChevronRight aria-hidden="true" className="absolute -end-0.5 top-[3px] h-4 w-4 text-red-700 rtl:rotate-180" />
          : <span className="absolute top-1 h-3.5 w-3.5 -ms-[7px] rounded-full shadow-[0_0_0_2px_#fff]" style={{ insetInlineStart: `${xPct(ratio)}%`, background: tone ? TONE_COLORS[tone] : '#0B1220' }} />}
      </div>
      <span className="text-end text-[13px] font-semibold tabular-nums" style={{ color: tone ? TONE_COLORS[tone] : undefined }}>{gap}</span>
      <span role="tooltip" className="pointer-events-none absolute bottom-full start-1/2 z-30 mb-1 hidden min-w-[190px] rounded-lg bg-gray-900 px-2.5 py-2 text-xs text-white shadow-lg group-hover:block group-focus:block">
        <b className="mb-1 block">{name}</b>
        <span className="flex justify-between gap-3.5 tabular-nums"><span>{t('tipThis')}</span><span>{money.sqm(row, sqm)}</span></span>
        <span className="flex justify-between gap-3.5 tabular-nums"><span>{t('tipAvg')}</span><span>{fmtNumber(ref.avg)}</span></span>
        <span className="flex justify-between gap-3.5 tabular-nums"><span>{t('tipRange')}</span><span>{t('range', { min: fmtNumber(ref.min), max: fmtNumber(ref.max) })}</span></span>
      </span>
    </div>
  )
}
