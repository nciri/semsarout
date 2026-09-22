import { describe, it, expect } from 'vitest'
import i18n from './index'

describe('pluriels arabes', () => {
  it('0, 2, 12, 100 retombent sur _other en arabe, pas sur le français', () => {
    const t = i18n.getFixedT('ar', 'backoffice')
    for (const n of [0, 2, 5, 12, 100]) expect(t('crm.pipeline.visits.agenda.count', { count: n })).toBe(`${n} زيارات`)
    expect(t('crm.pipeline.visits.agenda.count', { count: 1 })).toBe('1 زيارة')
  })

  it('le français garde ses propres règles', () => {
    const t = i18n.getFixedT('fr', 'backoffice')
    expect(t('crm.pipeline.visits.agenda.count', { count: 0 })).toBe('0 visite')
    expect(t('crm.pipeline.visits.agenda.count', { count: 12 })).toBe('12 visites')
  })
})
