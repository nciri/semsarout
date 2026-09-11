import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import BillingStatusBanner from './BillingStatusBanner'

const sub = (over) => ({ status: 'past_due', grace_until: '2026-10-05T10:00:00', billing_cycle: 'monthly',
  plan: { slug: 'pro' }, last_payment_failure_at: null, last_payment_failure_reason: null, ...over })
const renderBanner = (s) => render(<MemoryRouter><BillingStatusBanner subscription={s} /></MemoryRouter>)

describe('BillingStatusBanner', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("annonce la date de réduction d'accès et propose de payer", () => {
    renderBanner(sub())
    expect(screen.getByRole('alert')).toHaveTextContent('2026')
    expect(screen.getByRole('link', { name: 'Payer maintenant' }))
      .toHaveAttribute('href', '/checkout?plan=pro&billing=monthly')
  })

  it("dit que l'accès est réduit", () => {
    renderBanner(sub({ status: 'restricted' }))
    expect(screen.getByRole('alert')).toHaveTextContent('réduit')
  })

  it('montre le motif de la banque quand il existe', () => {
    renderBanner(sub({ last_payment_failure_at: '2026-09-20T09:00:00', last_payment_failure_reason: 'Carte refusée' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Carte refusée')
  })

  it("parle d'un échec sans motif sans jamais afficher de code technique", () => {
    renderBanner(sub({ last_payment_failure_at: '2026-09-20T09:00:00' }))
    expect(screen.getByRole('alert')).toHaveTextContent("n'a pas abouti")
    expect(screen.getByRole('alert')).not.toHaveTextContent('unknown')
  })

  it('ne montre rien pour un abonnement actif', () => {
    const { container } = renderBanner(sub({ status: 'active' }))
    expect(container).toBeEmptyDOMElement()
  })
})
