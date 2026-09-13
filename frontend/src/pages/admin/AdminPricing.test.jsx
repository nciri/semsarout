import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import AdminPricing from './AdminPricing'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({
  adminService: {
    getPricing: vi.fn(),
    getPriceChanges: vi.fn(),
    setServicePrice: vi.fn(),
    createServicePrice: vi.fn(),
    toggleServicePrice: vi.fn(),
    setPlanPrice: vi.fn(),
  },
}))

const PRICING = {
  services: [
    { code: 'forfait-vente', amount: 9900, currency: 'MAD', kind: 'one_off', is_active: true },
    { code: 'photos-pro', amount: 990, currency: 'MAD', kind: 'one_off', is_active: false },
  ],
  plans: [{ id: 2, slug: 'pro', name: 'Pro', price_monthly: 799, price_yearly: 7990 }],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><AdminPricing /></QueryClientProvider>)
}

describe('AdminPricing', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('fr')
    adminService.getPricing.mockResolvedValue(PRICING)
    adminService.getPriceChanges.mockResolvedValue({
      changes: [{ id: 1, code: 'forfait-vente', old_amount: 4900, new_amount: 9900,
                  changed_by: 7, changed_at: '2026-09-12T08:00:00' }],
    })
    adminService.setServicePrice.mockResolvedValue({})
    adminService.createServicePrice.mockResolvedValue({})
    adminService.toggleServicePrice.mockResolvedValue({})
    adminService.setPlanPrice.mockResolvedValue({})
  })

  it('montre les prestations, les abonnements et le dernier changement', async () => {
    renderPage()
    // `forfait-vente` figure dans la table ET dans l'historique : la requête doit le prévoir.
    expect(await screen.findAllByText('forfait-vente')).toHaveLength(2)
    expect(screen.getByText('photos-pro')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    // L'historique dit qui a changé quoi : un prix sans trace est un prix sans origine.
    expect(screen.getByText(/4\s?900/)).toBeInTheDocument()
  })

  it('enregistre un nouveau prix de prestation', async () => {
    renderPage()
    const field = await screen.findByLabelText('forfait-vente')
    fireEvent.change(field, { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer forfait-vente/i }))
    await waitFor(() => expect(adminService.setServicePrice)
      .toHaveBeenCalledWith('forfait-vente', 12000))
  })

  it('refuse un montant non positif sans appeler le serveur', async () => {
    renderPage()
    const field = await screen.findByLabelText('forfait-vente')
    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer forfait-vente/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(adminService.setServicePrice).not.toHaveBeenCalled()
  })

  it("retire une prestation de l'offre", async () => {
    renderPage()
    const toggle = await screen.findByLabelText(/Activer forfait-vente/i)
    fireEvent.click(toggle)
    await waitFor(() => expect(adminService.toggleServicePrice)
      .toHaveBeenCalledWith('forfait-vente', false))
  })

  it('enregistre les deux prix d’un abonnement', async () => {
    renderPage()
    const monthly = await screen.findByLabelText('Pro — mensuel')
    fireEvent.change(monthly, { target: { value: '899' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer Pro/i }))
    await waitFor(() => expect(adminService.setPlanPrice)
      .toHaveBeenCalledWith(2, { price_monthly: 899, price_yearly: 7990 }))
  })

  it('crée une prestation', async () => {
    renderPage()
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: 'diagnostic-energetique' } })
    fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la prestation' }))
    await waitFor(() => expect(adminService.createServicePrice)
      .toHaveBeenCalledWith({ code: 'diagnostic-energetique', amount: 1500, kind: 'one_off' }))
  })

  it("refuse une création sans code ou sans montant valable, sans appeler le serveur", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter la prestation' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(adminService.createServicePrice).not.toHaveBeenCalled()
  })
})
