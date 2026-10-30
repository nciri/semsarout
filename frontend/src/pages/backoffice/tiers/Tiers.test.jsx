import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import TiersLayout from './TiersLayout'

// Les deux onglets montent de vrais écrans branchés sur le réseau : ici seule la page
// d'onglets est en test, les enfants sont remplacés par des repères.
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/backoffice/tiers" element={<TiersLayout />}>
          <Route index element={<p>notaires et dossiers</p>} />
          <Route path="artisans" element={<p>artisans et interventions</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Tiers', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('réunit les deux métiers en deux onglets', async () => {
    renderAt('/backoffice/tiers')
    expect(await screen.findByText('Tiers')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Métiers des tiers' })
    expect(within(nav).getByRole('link', { name: 'Notaires & dossiers' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Artisans & interventions' })).toBeInTheDocument()
    expect(screen.getByText('notaires et dossiers')).toBeInTheDocument()
  })

  it("ouvre l'onglet des artisans", async () => {
    renderAt('/backoffice/tiers')
    await userEvent.click(await screen.findByRole('link', { name: 'Artisans & interventions' }))
    expect(screen.getByText('artisans et interventions')).toBeInTheDocument()
  })

  it('affiche les onglets en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/backoffice/tiers')
    expect(await screen.findByRole('link', { name: 'الموثّقون والملفّات' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'الحرفيّون والتدخّلات' })).toBeInTheDocument()
  })
})
