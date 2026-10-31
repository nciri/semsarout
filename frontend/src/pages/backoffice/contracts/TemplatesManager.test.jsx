import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import TemplatesManager from './TemplatesManager'

const { svc } = vi.hoisted(() => ({
  svc: { listTemplates: vi.fn(), createTemplate: vi.fn(), deleteTemplate: vi.fn() },
}))
vi.mock('../../../services/contractService', () => ({ contractService: svc }))
// Pas de `vi.mock` sur l'éditeur : `fileParallelism: false` (cf. vitest.config.js) fait
// partager le registre de modules entre tous les fichiers de test, donc un mock posé ici
// remplacerait l'éditeur dans les fichiers suivants — WorkOrderDetail.test.jsx tombait ainsi.

const INTEGRES = [
  { id: 11, name: "Bail d'habitation — loi n° 67-12", document_type: 'lease', lang: 'fr', is_global: true, is_builtin: true },
  { id: 12, name: 'عقد كراء محل معد للسكنى', document_type: 'lease', lang: 'ar', is_global: true, is_builtin: true },
]
const PROPRE = { id: 50, name: 'Ma trame maison', document_type: 'other', lang: 'fr', is_global: false, is_builtin: false }

function renderManager() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TemplatesManager /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('fr')
})

describe('page des modèles de contrats', () => {
  it('montre les modèles intégrés en français, sans suppression', async () => {
    // Le défaut corrigé : la page ne listait que les modèles de l'agence, donc les actes
    // fournis avec le produit — les seuls que la plupart des agences utiliseront — étaient
    // invisibles sur la page même où on vient les chercher.
    svc.listTemplates.mockResolvedValue({ can_manage_templates: true, templates: [...INTEGRES, PROPRE] })
    renderManager()

    const ligne = (await screen.findByText("Bail d'habitation — loi n° 67-12")).closest('li')
    expect(within(ligne).queryByRole('button')).toBeNull()   // un modèle intégré ne se supprime pas
    // La version arabe est la MÊME acte, pas un second modèle : elle n'est pas listée à côté.
    expect(screen.queryByText('عقد كراء محل معد للسكنى')).toBeNull()
    expect(screen.getByText('Ma trame maison')).toBeInTheDocument()
  })

  it('montre la version arabe du même acte à la demande', async () => {
    svc.listTemplates.mockResolvedValue({ can_manage_templates: true, templates: INTEGRES })
    renderManager()
    await screen.findByText("Bail d'habitation — loi n° 67-12")

    await userEvent.click(screen.getByRole('button', { name: 'Arabe' }))
    expect(screen.getByText('عقد كراء محل معد للسكنى')).toBeInTheDocument()
    expect(screen.queryByText("Bail d'habitation — loi n° 67-12")).toBeNull()
  })

  it('laisse les modèles intégrés visibles sans le plan Entreprise', async () => {
    // Les actes intégrés sont le catalogue du produit, utilisable par tout plan qui a
    // `contracts` : le mur d'abonnement ne couvre que la gestion des modèles de l'agence.
    svc.listTemplates.mockResolvedValue({ can_manage_templates: false, templates: INTEGRES })
    renderManager()

    expect(await screen.findByText("Bail d'habitation — loi n° 67-12")).toBeInTheDocument()
    expect(screen.getByText(/réservés au plan Entreprise/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Créer le modèle/i })).toBeNull()
  })
})
