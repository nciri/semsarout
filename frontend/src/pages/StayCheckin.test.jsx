import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import StayCheckin from './StayCheckin'

const { svc } = vi.hoisted(() => ({
  svc: { view: vi.fn(), declare: vi.fn(), uploadDoc: vi.fn(), submit: vi.fn() },
}))
vi.mock('../services/stayService', async (orig) => ({ ...(await orig()), stayCheckinService: svc }))

const VIEW = {
  status: 'sent',
  expires_at: '2026-11-09T00:00:00',
  document_types: ['cin', 'passeport', 'titre_sejour'],
  stay: {
    property_title: 'Riad Médina', check_in: '2026-11-05T00:00:00',
    check_out: '2026-11-08T00:00:00', nights: 3, expected_guests: 3,
  },
  guests: [
    { id: 1, full_name: 'Salma Bennani', is_lead: true, status: 'declared', review_note: null, documents: [] },
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sejour/enregistrement/jeton-prive']}>
        <Routes><Route path="/sejour/enregistrement/:token" element={<StayCheckin />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Enregistrement du séjour (voyageur)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset())
    svc.view.mockResolvedValue(VIEW)
    svc.declare.mockResolvedValue({ guest: { id: 2 } })
    svc.uploadDoc.mockResolvedValue({ document: { id: 9 } })
    svc.submit.mockResolvedValue({ link: { status: 'submitted' } })
  })

  it('montre le séjour et ce qui reste à faire', async () => {
    renderPage()
    expect(await screen.findByText(/Riad Médina/)).toBeInTheDocument()
    expect(screen.getByText('1 occupant déclaré sur 3')).toBeInTheDocument()
    expect(screen.getByLabelText(/Pièce d'identité/)).toBeInTheDocument()
  })

  it('déclare un accompagnant', async () => {
    renderPage()
    await userEvent.type(await screen.findByLabelText('Nom complet'), 'Youssef Bennani')
    await userEvent.type(screen.getByLabelText('Numéro de la pièce'), 'AB12345')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await vi.waitFor(() => expect(svc.declare).toHaveBeenCalledWith('jeton-prive', {
      full_name: 'Youssef Bennani', document_type: 'cin', document_number: 'AB12345',
      nationality: '', birth_date: '',
    }))
  })

  it('envoie la pièce d’identité du voyageur', async () => {
    renderPage()
    const file = new File(['x'], 'cin.jpg', { type: 'image/jpeg' })
    await userEvent.upload(await screen.findByLabelText(/Pièce d'identité/), file)
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la pièce' }))
    await vi.waitFor(() => expect(svc.uploadDoc).toHaveBeenCalledWith('jeton-prive', 1, file))
  })

  it('transmet le dossier à l’hôte', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: "J'ai terminé" }))
    await vi.waitFor(() => expect(svc.submit).toHaveBeenCalledWith('jeton-prive'))
  })

  it('explique un lien expiré sans rien dévoiler', async () => {
    svc.view.mockRejectedValue({ response: { status: 410, data: { error: 'Ce lien a expiré.' } } })
    renderPage()
    expect(await screen.findByText('Lien indisponible')).toBeInTheDocument()
    expect(screen.getByText('Ce lien a expiré.')).toBeInTheDocument()
  })
})
