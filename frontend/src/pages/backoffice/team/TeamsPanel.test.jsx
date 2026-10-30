import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import TeamsPanel from './TeamsPanel'

const { svc } = vi.hoisted(() => ({
  svc: {
    createTeam: vi.fn(), updateTeam: vi.fn(), deleteTeam: vi.fn(),
    addMembership: vi.fn(), removeMembership: vi.fn(),
  },
}))
vi.mock('../../../services/teamService', () => ({ teamService: svc }))

const KINDS = [
  { kind: 'generale', jobs: ['responsable', 'membre'], operations: false },
  { kind: 'menage', jobs: ['responsable', 'agent', 'blanchisserie'], operations: true },
  { kind: 'maintenance', jobs: ['responsable', 'technicien'], operations: true },
]
const MEMBERS = [
  { id: 7, full_name: 'Rachid Alami' },
  { id: 8, full_name: 'Salma Bennani' },
]
const TEAMS = [
  { id: 3, name: 'Ménage Gueliz', kind: 'menage', color: '#1E7F4E', description: 'Rotation',
    members_count: 2, memberships: [{ user_id: 7, job: 'agent' }] },
]

function renderPanel(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TeamsPanel teams={TEAMS} kinds={KINDS} members={MEMBERS} canManage canAddTeam {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Équipes métier', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset())
    svc.createTeam.mockResolvedValue({ team: { id: 9 } })
    svc.updateTeam.mockResolvedValue({ team: { id: 3 } })
    svc.addMembership.mockResolvedValue({ membership: { id: 1 } })
    svc.removeMembership.mockResolvedValue({})
  })

  it("montre le métier de l'équipe et le rôle de chaque renfort", () => {
    renderPanel()
    expect(screen.getByText('Ménage Gueliz')).toBeInTheDocument()
    expect(screen.getByText(/Ménage · 2 membres/)).toBeInTheDocument()
    expect(screen.getByText('Rachid Alami')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
  })

  it('crée une équipe avec son métier', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await userEvent.type(screen.getByLabelText('Nom'), 'Maintenance')
    await userEvent.selectOptions(screen.getByLabelText('Métier'), 'maintenance')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(svc.createTeam).toHaveBeenCalled())
    expect(svc.createTeam.mock.calls[0][0]).toMatchObject({ name: 'Maintenance', kind: 'maintenance' })
  })

  it("n'offre que les rôles du métier choisi", async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un renfort' }))
    const jobs = screen.getByLabelText("Rôle dans l'équipe")
    expect(within(jobs).queryByText('Technicien')).not.toBeInTheDocument()
    expect(within(jobs).getByText('Blanchisserie')).toBeInTheDocument()
  })

  it('ajoute un renfort avec son rôle', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un renfort' }))
    await userEvent.selectOptions(screen.getByLabelText('Membre'), '8')
    await userEvent.selectOptions(screen.getByLabelText("Rôle dans l'équipe"), 'blanchisserie')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(svc.addMembership)
      .toHaveBeenCalledWith(3, { user_id: 8, job: 'blanchisserie' }))
  })

  it("masque les actions quand l'agent ne gère pas l'équipe", () => {
    renderPanel({ canManage: false })
    expect(screen.queryByRole('button', { name: 'Ajouter un renfort' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
  })
})
