import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import BookVisitWidget from './BookVisitWidget'

function renderWidget() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BookVisitWidget propertyId={null} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BookVisitWidget i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend le titre en FR', async () => {
    renderWidget()
    expect(await screen.findByText(i18n.t('common:visit.heading'))).toBeInTheDocument()
  })

  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderWidget()
    expect(await screen.findByText(i18n.t('common:visit.heading'))).toBeInTheDocument()
  })
})
