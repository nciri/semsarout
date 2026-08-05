import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import CheckoutConfirmation from './CheckoutConfirmation'

// CheckoutConfirmation reads paymentId/method from router location state (set by
// PaymentGateway's navigate call), not from URL search params — so the success
// state is reached via a MemoryRouter entry object carrying `state`.
function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/paiement/confirmation', state: { paymentId: 'ABC', method: 'card' } },
      ]}
    >
      <CheckoutConfirmation />
    </MemoryRouter>,
  )
}

describe('CheckoutConfirmation i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre succès en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkoutConfirmation.successTitle'))).toBeInTheDocument()
  })
  it('rend le titre succès en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkoutConfirmation.successTitle'))).toBeInTheDocument()
  })
})
