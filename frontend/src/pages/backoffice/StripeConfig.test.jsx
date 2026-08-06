import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import useAuthStore from '../../store/authStore'
import StripeConfig from './StripeConfig'

function renderStripeConfig() {
  return render(
    <MemoryRouter>
      <StripeConfig />
    </MemoryRouter>,
  )
}

describe('StripeConfig i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    useAuthStore.setState({ user: { role: 'admin' } })
  })

  it('affiche le titre FR', async () => {
    renderStripeConfig()
    expect(await screen.findByText('Clés API')).toBeInTheDocument()
    expect(await screen.findByText('Admin uniquement')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderStripeConfig()
    expect(await screen.findByText('مفاتيح API')).toBeInTheDocument()
    expect(await screen.findByText('للمشرفين فقط')).toBeInTheDocument()
  })
})
