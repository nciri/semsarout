import { useTranslation } from 'react-i18next'
import { FiInfo } from 'react-icons/fi'

const BAND_COLOR = {
  very_low: '#16a34a',
  low: '#65a30d',
  average: '#eab308',
  high: '#f97316',
  very_high: '#dc2626'
}

const fmt = (v) => Math.round(v).toLocaleString('fr-FR')

/**
 * Colored gauge showing where a property's price/m² sits within its
 * neighborhood. `data` is the payload from GET /properties/:id/price-position.
 * Renders nothing when the position isn't available (no surface / not enough data).
 */
export default function PriceGauge({ data }) {
  const { t } = useTranslation(['common'])
  if (!data?.available) return null

  const {
    property_price_sqm, reference_price_sqm, low_price_sqm, high_price_sqm,
    percent_vs_market, position, band, label, scope_label, sample_size,
    source, transaction_type
  } = data

  const color = BAND_COLOR[band] || '#64748b'
  const unit = t(transaction_type === 'rent' ? 'common:priceGauge.unitRent' : 'common:priceGauge.unitSale')
  const pct = Math.round(Math.abs(percent_vs_market))
  const sense = percent_vs_market > 1 ? 'above' : percent_vs_market < -1 ? 'below' : 'in'
  const cursor = `${Math.max(2, Math.min(98, position * 100))}%`

  const note = source === 'manual'
    ? t('common:priceGauge.referenceNote')
    : t('common:priceGauge.estimatedNote', { count: sample_size, scope: scope_label })

  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
          {t('common:priceGauge.title')}
          <span title={t('common:priceGauge.tooltip')}>
            <FiInfo className="w-3.5 h-3.5 text-gray-400" />
          </span>
        </h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: color }}>
          {percent_vs_market > 0 ? '+' : ''}{percent_vs_market}%
        </span>
      </div>

      {/* Gradient bar with cursor */}
      <div className="relative mt-6 mb-1">
        <div
          className="h-2.5 rounded-full"
          style={{ background: 'linear-gradient(to right, #16a34a, #eab308, #f97316, #dc2626)' }}
        />
        {/* cursor */}
        <div className="absolute -top-1 -translate-x-1/2" style={{ left: cursor }}>
          <div className="w-4 h-4 rounded-full border-2 border-white shadow" style={{ backgroundColor: color }} />
        </div>
      </div>

      <div className="flex justify-between text-[11px] text-gray-400 mb-3">
        <span>{fmt(low_price_sqm)}</span>
        <span>{t('common:priceGauge.avgLabel', { price: fmt(reference_price_sqm), unit })}</span>
        <span>{fmt(high_price_sqm)}</span>
      </div>

      <div className="flex items-baseline justify-between">
        <div className="text-sm">
          <span className="font-bold text-gray-900">{fmt(property_price_sqm)} {unit}</span>
          <span className="text-gray-500"> {t('common:priceGauge.forThisProperty')}</span>
        </div>
        <span className="text-sm font-medium" style={{ color }}>{label}</span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        <span>
          {pct === 0
            ? t('common:priceGauge.inAverage')
            : t('common:priceGauge.pctVsAverage', { percent: pct, sense: t(`common:priceGauge.sense.${sense}`) })}
        </span>
        {' · '}
        <span>{note}</span>
      </p>
    </div>
  )
}
