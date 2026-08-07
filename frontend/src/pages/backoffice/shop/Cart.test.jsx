import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import Cart from './Cart'

function renderCart() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Cart />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, les appels react-query échouent (pas de serveur) :
// le composant retombe sur un panier vide par défaut, qui affiche l'état vide
// (empty.title), utilisé ici comme ancre de rendu stable FR/AR.
describe('Cart i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("affiche le message de panier vide FR", async () => {
    renderCart()
    expect(await screen.findByText('Votre panier est vide')).toBeInTheDocument()
  })

  it("affiche le message de panier vide AR après bascule", async () => {
    await i18n.changeLanguage('ar')
    renderCart()
    expect(await screen.findByText('سلتك فارغة')).toBeInTheDocument()
  })
})
