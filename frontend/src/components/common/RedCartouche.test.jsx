import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RedCartouche from './RedCartouche'

it('applique le gradient et la rotation du logo', () => {
  render(<RedCartouche>Éditeur de plan</RedCartouche>)
  const el = screen.getByText('Éditeur de plan')
  expect(el.className).toMatch(/-rotate-\[4deg\]/)
  expect(el.getAttribute('style')).toMatch(/linear-gradient/)
})
