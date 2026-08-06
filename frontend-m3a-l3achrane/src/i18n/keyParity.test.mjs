import { test } from 'node:test'
import assert from 'node:assert/strict'

import commonFr from '../locales/fr/common.json' with { type: 'json' }
import webFr from '../locales/fr/web.json' with { type: 'json' }
import appFr from '../locales/fr/app.json' with { type: 'json' }
import partnerFr from '../locales/fr/partner.json' with { type: 'json' }
import commonAr from '../locales/ar/common.json' with { type: 'json' }
import webAr from '../locales/ar/web.json' with { type: 'json' }
import appAr from '../locales/ar/app.json' with { type: 'json' }
import partnerAr from '../locales/ar/partner.json' with { type: 'json' }

const NAMESPACES = {
  common: [commonFr, commonAr],
  web: [webFr, webAr],
  app: [appFr, appAr],
  partner: [partnerFr, partnerAr],
}

// Deep key paths ("notFound.title") so nesting mismatches are caught too, not just top level.
function keyPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return keyPaths(value, path)
    }
    return [path]
  })
}

for (const [ns, [fr, ar]] of Object.entries(NAMESPACES)) {
  test(`i18n key parity: ${ns} namespace has identical fr/ar key sets`, () => {
    const frKeys = keyPaths(fr).sort()
    const arKeys = keyPaths(ar).sort()

    const missingInAr = frKeys.filter((k) => !arKeys.includes(k))
    const missingInFr = arKeys.filter((k) => !frKeys.includes(k))

    assert.deepEqual(missingInAr, [], `keys present in fr/${ns}.json but missing in ar/${ns}.json`)
    assert.deepEqual(missingInFr, [], `keys present in ar/${ns}.json but missing in fr/${ns}.json`)
  })
}
