import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import AgencyMessages from './AgencyMessages'

function renderAgencyMessages() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AgencyMessages />
    </QueryClientProvider>,
  )
}

describe('AgencyMessages i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre en FR', async () => {
    renderAgencyMessages()
    expect(await screen.findByText('Messages reçus')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderAgencyMessages()
    expect(await screen.findByText('الرسائل المستلمة')).toBeInTheDocument()
  })
})
