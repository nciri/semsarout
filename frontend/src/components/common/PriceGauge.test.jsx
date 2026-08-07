import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import PriceGauge from './PriceGauge'

const data = {
  available: true,
  property_price_sqm: 12000,
  reference_price_sqm: 11000,
  low_price_sqm: 9000,
  high_price_sqm: 14000,
  percent_vs_market: 0,
  position: 0.5,
  band: 'average',
  label: 'Moyen',
  scope_label: 'Quartier',
  sample_size: 5,
  source: 'manual',
  transaction_type: 'sale',
}

describe('PriceGauge i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend la note de prix de référence en FR', async () => {
    render(<PriceGauge data={data} />)
    expect(await screen.findByText(i18n.t('common:priceGauge.referenceNote'))).toBeInTheDocument()
  })

  it('rend la note de prix de référence en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<PriceGauge data={data} />)
    expect(await screen.findByText(i18n.t('common:priceGauge.referenceNote'))).toBeInTheDocument()
  })
})
