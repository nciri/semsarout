import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import MyLeads from './MyLeads'

function renderMyLeads() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MyLeads />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MyLeads i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre en FR', async () => {
    renderMyLeads()
    expect(await screen.findByText('Mes contacts')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderMyLeads()
    expect(await screen.findByText('جهات الاتصال')).toBeInTheDocument()
  })
})
