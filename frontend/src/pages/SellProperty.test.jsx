import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from 'react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import SellProperty from './SellProperty'

// La page lit le catalogue (usePricing) au montage. Sans ce mock, l'appel part vers un
// serveur absent sous jsdom et la `AxiosError: Network Error` se journalise APRÈS la fin du
// test, pendant la fermeture du worker vitest : « Closing rpc while "onUserConsoleLog" was
// pending » — suite verte mais processus en échec, de façon intermittente (CI du 2026-09-15).
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: { services: [], plans: [] } })),
    post: vi.fn(),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/vendre']}><SellProperty /></MemoryRouter></QueryClientProvider>)
}

describe('SellProperty i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:sellProperty.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:sellProperty.title'))).toBeInTheDocument()
  })

  // La description part dans `property.description` du dossier de vente, le même champ que
  // la fiche publique affiche : elle est saisie en WYSIWYG, donc en HTML assaini.
  it('saisit la description en texte riche et en remonte du HTML nettoyé', async () => {
    renderPage()
    const champ = await screen.findByRole('textbox', {
      name: i18n.t('public:sellProperty.step1.descriptionLabel'),
    })
    expect(champ).toHaveAttribute('contenteditable', 'true')
    // La barre d'outils du champ porte ses libellés traduits.
    expect(screen.getByRole('button', { name: i18n.t('common:richText.bold') })).toBeInTheDocument()

    champ.innerHTML = '<p class="MsoNormal">Salon <strong>refait</strong></p><script>alert(1)</script>'
    fireEvent.input(champ)
    // Ce que le dossier de vente retient (brouillon du formulaire) est du HTML réduit à la
    // liste blanche : le collage sale ne repartira pas tel quel vers le service.
    await vi.waitFor(() => {
      const { form } = JSON.parse(localStorage.getItem('sell-wizard-v1'))
      expect(form.description).toBe('<p>Salon <strong>refait</strong></p>')
    })
  })
})
