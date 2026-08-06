import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import MyApplicationDetail from './MyApplicationDetail'

function renderMyApplicationDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/dashboard/candidatures/1']}>
        <Routes>
          <Route path="/dashboard/candidatures/:id" element={<MyApplicationDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Sans backend disponible, la requête échoue et le composant retombe sur son
// état "candidature introuvable" : ancre de rendu stable pour FR/AR.
describe('MyApplicationDetail i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("affiche l'état introuvable en FR", async () => {
    renderMyApplicationDetail()
    expect(await screen.findByText('Candidature introuvable.')).toBeInTheDocument()
  })

  it("affiche l'état introuvable en AR après bascule", async () => {
    await i18n.changeLanguage('ar')
    renderMyApplicationDetail()
    expect(await screen.findByText('طلب الترشح غير موجود.')).toBeInTheDocument()
  })
})
