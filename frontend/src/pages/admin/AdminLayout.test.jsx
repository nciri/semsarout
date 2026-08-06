import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import AdminLayout from './AdminLayout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminLayout />
    </MemoryRouter>,
  )
}

describe('AdminLayout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend les libellés FR', () => {
    renderLayout()
    expect(screen.getByText('Comptes')).toBeInTheDocument()
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
  })

  it('rend les libellés AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLayout()
    expect(screen.getByText('الحسابات')).toBeInTheDocument()
    expect(screen.getByText('نظرة عامة')).toBeInTheDocument()
  })
})
