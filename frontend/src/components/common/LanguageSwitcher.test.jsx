import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import LanguageSwitcher from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche la langue cible et bascule au clic', async () => {
    render(<LanguageSwitcher />)
    // En FR, la cible est l'arabe.
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('العربية')
    await userEvent.click(btn)
    expect(i18n.language).toBe('ar')
  })
})
