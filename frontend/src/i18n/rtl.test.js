import { describe, it, expect, beforeEach } from 'vitest'
import { isRtl, applyDirection } from './rtl'

describe('rtl helpers', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('dir')
    document.documentElement.removeAttribute('lang')
  })

  it('isRtl vrai seulement pour ar', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('fr')).toBe(false)
  })

  it('applyDirection pose lang et dir sur <html>', () => {
    applyDirection('ar')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    applyDirection('fr')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
  })
})
