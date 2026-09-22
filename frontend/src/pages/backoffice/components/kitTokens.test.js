import { describe, it, expect } from 'vitest'
import { rowEnd } from './kitTokens'

const DASH = ['leads', 'visits', 'results', 'pipe', 'props']
const span = (k) => (k === 'pipe' ? 2 : 1)

describe('rowEnd', () => {
  it('3 colonnes : le pipeline (2 colonnes) et le portefeuille partagent la rangée', () => {
    expect(rowEnd(DASH, 'pipe', 3, span)).toBe('props')
    expect(rowEnd(DASH, 'props', 3, span)).toBe('props')
    expect(rowEnd(DASH, 'visits', 3, span)).toBe('results')
  })
  it('2 colonnes : le pipeline occupe sa rangée seul', () => {
    expect(rowEnd(DASH, 'results', 2, span)).toBe('results')
    expect(rowEnd(DASH, 'pipe', 2, span)).toBe('pipe')
    expect(rowEnd(DASH, 'leads', 2, span)).toBe('visits')
  })
  it('1 colonne : le détail suit la carte ouverte', () => {
    expect(rowEnd(DASH, 'pipe', 1, span)).toBe('pipe')
  })
})
