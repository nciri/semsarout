import { describe, it, expect } from 'vitest'
import frCommon from '../locales/fr/common.json'
import arCommon from '../locales/ar/common.json'
import frBackoffice from '../locales/fr/backoffice.json'
import arBackoffice from '../locales/ar/backoffice.json'

function flatKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' ? flatKeys(v, key) : [key]
  })
}

describe('parité des clés FR/AR', () => {
  it.each([
    ['common', frCommon, arCommon],
    ['backoffice', frBackoffice, arBackoffice],
  ])('%s a les mêmes clés en FR et AR', (_ns, fr, ar) => {
    expect(flatKeys(ar).sort()).toEqual(flatKeys(fr).sort())
  })
})
