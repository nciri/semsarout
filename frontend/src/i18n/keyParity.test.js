import { describe, it, expect } from 'vitest'
import frCommon from '../locales/fr/common.json'
import arCommon from '../locales/ar/common.json'
import frBackoffice from '../locales/fr/backoffice.json'
import arBackoffice from '../locales/ar/backoffice.json'
import frAuth from '../locales/fr/auth.json'
import arAuth from '../locales/ar/auth.json'
import frPublic from '../locales/fr/public.json'
import arPublic from '../locales/ar/public.json'
import frDashboard from '../locales/fr/dashboard.json'
import arDashboard from '../locales/ar/dashboard.json'
import frAdmin from '../locales/fr/admin.json'
import arAdmin from '../locales/ar/admin.json'

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
    ['auth', frAuth, arAuth],
    ['public', frPublic, arPublic],
    ['dashboard', frDashboard, arDashboard],
    ['admin', frAdmin, arAdmin],
  ])('%s a les mêmes clés en FR et AR', (_ns, fr, ar) => {
    expect(flatKeys(ar).sort()).toEqual(flatKeys(fr).sort())
  })
})
