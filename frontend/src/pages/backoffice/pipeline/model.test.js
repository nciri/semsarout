import { describe, it, expect } from 'vitest'
import {
  agentLoad, amountOf, daysInStage, idleTone, isActionable, laneTotals, longestIdle, matches,
  moveInPipeline, outcomes, todoItems, totals,
} from './model'

const NOW = new Date('2026-07-27T09:00:00')
const tx = (id, o = {}) => ({ id, reference: `TX-${id}`, asking_price: 1000, probability: 50, agent_id: 1, agent_name: 'Salma Rifai', flags: [], ...o })
const flag = (severity, code = 'x') => ({ code, severity, params: {} })

describe('montants', () => {
  it("prend l'offre si elle est saisie, sinon le prix demandé, et pondère par la probabilité", () => {
    expect(amountOf(tx(1, { offer_price: 900 }))).toBe(900)
    expect(totals([tx(1, { offer_price: 900, commission_rate: 2 }), tx(2)]))
      .toEqual({ count: 2, gross: 1900, weighted: 950, commission: 9 })
  })

  it('totalise chaque étape, vide comprise', () => {
    const lanes = laneTotals([{ id: 'visit' }, { id: 'offer' }], [tx(1, { stage: 'offer', probability: 100 })])
    expect(lanes.map((l) => [l.id, l.rows.length, l.weighted])).toEqual([['visit', 0, 0], ['offer', 1, 1000]])
  })
})

describe('immobilité', () => {
  it("lit les jours servis par l'API, sinon les calcule depuis l'entrée dans l'étape", () => {
    expect(daysInStage(tx(1, { days_in_stage: 12 }), NOW)).toBe(12)
    expect(daysInStage(tx(1, { stage_entered_at: '2026-06-25T09:00:00' }), NOW)).toBe(32)
    expect(daysInStage(tx(1, { created_at: '2026-07-24T09:00:00' }), NOW)).toBe(3)
  })

  it('rougit au-delà de 21 jours, orange au-delà de 14', () => {
    expect([idleTone(22), idleTone(21), idleTone(15), idleTone(14)]).toEqual(['crit', 'warn', 'warn', 'neutral'])
    expect(longestIdle([tx(1, { days_in_stage: 3 }), tx(2, { days_in_stage: 32 })], NOW).id).toBe(2)
  })
})

describe('à traiter', () => {
  it('une vérification seule ne rend pas un dossier « à traiter »', () => {
    expect(isActionable(tx(1, { flags: [flag('info')] }))).toBe(false)
    expect(isActionable(tx(1, { flags: [flag('info'), flag('warn')] }))).toBe(true)
  })

  it('classe les constats par gravité puis par immobilité', () => {
    const rows = [
      tx(1, { days_in_stage: 3, flags: [flag('info', 'a')] }),
      tx(2, { days_in_stage: 5, flags: [flag('warn', 'b')] }),
      tx(3, { days_in_stage: 30, flags: [flag('warn', 'c'), flag('crit', 'd')] }),
    ]
    expect(todoItems(rows, NOW).map((x) => x.f.code)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('filtre sur « à traiter » et cherche dans client, bien et référence', () => {
    const t = tx(1, { client_name: 'Aicha Tazi', property_title: 'Riad', flags: [flag('warn')] })
    expect(matches(t, { q: 'tazi' })).toBe(true)
    expect(matches(t, { q: 'tx-1' })).toBe(true)
    expect(matches(t, { q: 'villa' })).toBe(false)
    expect(matches(tx(2), { onlyTodo: true })).toBe(false)
  })
})

describe('agents et sorties', () => {
  it('charge par agent, triée par pondéré', () => {
    const load = agentLoad([tx(1, { agent_id: 1 }), tx(2, { agent_id: 2, agent_name: 'Omar', probability: 90, flags: [flag('crit')] })])
    expect(load.map((a) => [a.id, a.count, a.weighted, a.todo])).toEqual([[2, 1, 900, 1], [1, 1, 500, 0]])
  })

  it('compte gagnées et perdues et isole la plus grosse perte', () => {
    const o = outcomes([{ status: 'won', amount: 5 }, { status: 'lost', amount: 10 }, { status: 'lost', amount: 30, stage: 'negotiation' }])
    expect([o.won, o.lost, o.lostSum, o.biggestLost.stage]).toEqual([1, 2, 40, 'negotiation'])
  })
})

it('déplace une carte dans la réponse en cache sans toucher aux autres', () => {
  const data = { pipeline: [{ id: 'visit', transactions: [tx(1), tx(2)] }, { id: 'offer', transactions: [] }] }
  const out = moveInPipeline(data, 1, 'offer', '2026-07-27T09:00:00')
  expect(out.pipeline.map((s) => s.transactions.map((t) => t.id))).toEqual([[2], [1]])
  expect(out.pipeline[1].transactions[0]).toMatchObject({ stage: 'offer', days_in_stage: 0 })
  expect(data.pipeline[0].transactions).toHaveLength(2)
})
