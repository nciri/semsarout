import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import TemplatesManager from './TemplatesManager'

const { svc } = vi.hoisted(() => ({
  svc: {
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    uploadTemplate: vi.fn(),
    templateFileUrl: (id) => `/api/v1/backoffice/contract-templates/${id}/file`,
  },
}))
vi.mock('../../../services/contractService', () => ({ contractService: svc }))
// ReactQuill touche au DOM de Quill, inutile ici : le dépôt de fichier ne passe pas par l'éditeur.
vi.mock('react-quill-new', () => ({ default: () => <div data-testid="quill" /> }))
vi.mock('react-quill-new/dist/quill.snow.css', () => ({}))

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function renderManager() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TemplatesManager /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.listTemplates.mockResolvedValue({
    can_manage_templates: true,
    templates: [
      { id: 1, name: 'Trame HTML', document_type: 'other', is_global: false, has_file: false, body_html: '<p>x</p>' },
      { id: 2, name: 'Mandat Atlas', document_type: 'mandate_sale', is_global: false, has_file: true, file_name: 'Mandat Atlas.docx', file_mime: DOCX },
    ],
  })
  svc.uploadTemplate.mockResolvedValue({ template: { id: 3 } })
})

describe('modèles de contrats déposés en fichier', () => {
  it('envoie le fichier, son nom et son type au service', async () => {
    renderManager()
    const fichier = new File([new Uint8Array([0x50, 0x4b])], 'Bail.docx', { type: DOCX })

    await userEvent.type((await screen.findAllByPlaceholderText(/Mandat de vente standard/i))[1], 'Bail Atlas')
    await userEvent.upload(screen.getByLabelText(/\.doc, \.docx ou PDF/i), fichier)
    await userEvent.click(screen.getByRole('button', { name: /Déposer le modèle/i }))

    expect(svc.uploadTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ file: fichier, name: 'Bail Atlas' }),
    )
  })

  it('donne un lien de téléchargement aux seuls modèles fichier', async () => {
    renderManager()
    const fichier = (await screen.findByText('Mandat Atlas')).closest('li')
    expect(within(fichier).getByRole('link', { name: /Télécharger/i }))
      .toHaveAttribute('href', '/api/v1/backoffice/contract-templates/2/file')
    // La trame HTML s'édite, elle ne se télécharge pas : pas de lien sur sa ligne.
    const html = screen.getByText('Trame HTML').closest('li')
    expect(within(html).queryByRole('link')).toBeNull()
  })
})
