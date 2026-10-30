import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { ConfirmContext } from '../../../components/common/confirm'
import i18n from '../../../i18n'
import MandateDetail from './MandateDetail'
import { daysSince } from './model'

const ask = vi.hoisted(() => vi.fn((o) => o.onConfirm()))
const svc = vi.hoisted(() => ({ getMandate: vi.fn(), listCrg: vi.fn(), validateCrg: vi.fn() }))
vi.mock('../../../services/rentalService', () => ({ rentalService: svc }))
vi.mock('../../../components/backoffice/SignaturePanel', () => ({ default: () => null }))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmContext.Provider value={ask}>
      <MemoryRouter initialEntries={['/backoffice/gestion-locative/mandats/3']}>
        <Routes><Route path="/backoffice/gestion-locative/mandats/:id" element={<MandateDetail />} /></Routes>
      </MemoryRouter>
      </ConfirmContext.Provider>
    </QueryClientProvider>,
  )
}

describe('MandateDetail — compte rendu de gérance', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    ask.mockClear()
    Object.values(svc).forEach((m) => m.mockReset())
    svc.getMandate.mockResolvedValue({ id: 3, reference: 'MND-3', status: 'active', mandate_type: 'gestion', property_id: 7, landlord_client_id: 1 })
    svc.validateCrg.mockResolvedValue({})
  })

  it('montre les dépenses du brouillon et permet d’en écarter une', async () => {
    svc.listCrg.mockResolvedValue({ reports: [{ id: 12, period_label: 'Septembre 2026',
      status: 'draft', rent_collected: 6000, fees: 480, expenses: 1500, net: 4020,
      created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      expense_lines: [{ id: 4, title: 'Chauffe-eau', cost_final: 1200 },
                      { id: 5, title: 'Serrure', cost_final: 300 }] }] })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Écarter Serrure' }))
    expect(screen.getByText(/Net après écarts : 4\s320 Dh/)).toBeInTheDocument()
    expect(screen.getByText('40 j')).toBeInTheDocument()
    expect(screen.getByText('Écarts non enregistrés avant validation')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Valider le compte rendu' }))
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/Septembre 2026.*4\s320 Dh/) }))
    await vi.waitFor(() => expect(svc.validateCrg).toHaveBeenCalledWith(12,
      { excluded_work_order_ids: [5], fees: 480 }))
  })

  it('corrige les honoraires avant envoi, borne la saisie et recalcule le net', async () => {
    // Décision A de la spec : l'agence qui accorde une remise ponctuelle n'avait aucun levier
    // hors `mandate.fee_percent`, qui changerait rétroactivement tous les mois à venir.
    svc.listCrg.mockResolvedValue({ reports: [{ id: 12, period_label: 'Septembre 2026',
      status: 'draft', rent_collected: 6000, fees: 480, expenses: 1200, net: 4320,
      created_at: new Date().toISOString(), expense_lines_editable: true,
      expense_lines: [{ id: 4, title: 'Chauffe-eau', cost_final: 1200 }] }] })
    renderPage()
    const champ = await screen.findByLabelText('Honoraires de gestion (Dh)')
    expect(champ).toHaveValue(480)
    await userEvent.clear(champ)
    await userEvent.type(champ, '200')
    expect(screen.getByText(/Net après écarts : 4\s600 Dh/)).toBeInTheDocument()

    // Borne haute : au-delà des loyers encaissés, la validation est refusée côté écran.
    await userEvent.clear(champ)
    await userEvent.type(champ, '9000')
    expect(screen.getByText('Montant invalide : les honoraires vont de 0 à 6 000 Dh.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valider le compte rendu' })).toBeDisabled()

    await userEvent.clear(champ)
    await userEvent.type(champ, '200')
    await userEvent.click(screen.getByRole('button', { name: 'Valider le compte rendu' }))
    await vi.waitFor(() => expect(svc.validateCrg).toHaveBeenCalledWith(12,
      { excluded_work_order_ids: [], fees: 200 }))
  })

  it('montre en lecture seule, avec date et artisan, les dépenses d’un compte rendu envoyé', async () => {
    // Après validation, plus rien ne les montrait : un net amputé sans ligne explicative est la
    // plainte d'origine de la spec, et l'agence doit pouvoir répondre au propriétaire.
    svc.listCrg.mockResolvedValue({ reports: [{ id: 11, period_label: 'Août 2026',
      status: 'sent', rent_collected: 6000, fees: 480, expenses: 1200, net: 4320,
      expense_lines_editable: false,
      expense_lines: [{ id: 4, title: 'Chauffe-eau', cost_final: 1200, artisan_name: 'Plomberie Atlas', completed_at: '2026-07-28T00:00:00' }] }] })
    renderPage()
    const lignes = await screen.findByRole('list', { name: 'Dépenses imputées au brouillon de Août 2026' })
    expect(within(lignes).getByText('Chauffe-eau')).toBeInTheDocument()
    expect(within(lignes).getByText(/28 juil\. 2026 · Plomberie Atlas/)).toBeInTheDocument()
    expect(within(lignes).getByText(/1\s200 Dh/)).toBeInTheDocument()
    // Lecture seule : aucune action d'exclusion sur un relevé parti.
    expect(screen.queryByRole('button', { name: 'Écarter Chauffe-eau' })).not.toBeInTheDocument()
    expect(screen.getByText('Dépenses retenues sur Août 2026 (1)')).toBeInTheDocument()
  })

  it('un compte rendu envoyé ne se valide plus', async () => {
    svc.listCrg.mockResolvedValue({ reports: [{ id: 11, period_label: 'Août 2026',
      status: 'sent', rent_collected: 6000, fees: 480, expenses: 0, net: 5520 }] })
    renderPage()
    expect(await screen.findByText('Août 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider le compte rendu' })).not.toBeInTheDocument()
  })

  it('un compte rendu validé ne se valide plus non plus', async () => {
    svc.listCrg.mockResolvedValue({ reports: [{ id: 13, period_label: 'Juillet 2026',
      status: 'validated', rent_collected: 6000, fees: 480, expenses: 0, net: 5520 }] })
    renderPage()
    expect(await screen.findByText('Juillet 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider le compte rendu' })).not.toBeInTheDocument()
  })
})

describe('daysSince', () => {
  it('traite l’horodatage naïf comme UTC et tolère une date absente', () => {
    const naive = new Date(Date.now() - 3 * 86400000 - 3600000).toISOString().replace('Z', '')
    expect(daysSince(naive)).toBe(3)
    expect(daysSince(null)).toBe(0)
  })
})
