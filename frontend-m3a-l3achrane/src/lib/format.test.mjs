import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMad, frenchPunct, matchTone } from './format.js'

const NB = '\xa0'

test('formatMad spaces thousands and appends /mois with nbsp', () => {
  assert.equal(formatMad(2300), `2${NB}300${NB}Đh${NB}/mois`)
  assert.equal(formatMad(950), `950${NB}Đh${NB}/mois`)
  assert.equal(formatMad(12000), `12${NB}000${NB}Đh${NB}/mois`)
})

test('formatMad without suffix drops /mois', () => {
  assert.equal(formatMad(2300, { suffix: false }), `2${NB}300${NB}Đh`)
})

test('frenchPunct inserts nbsp before : ; ! ?', () => {
  assert.equal(frenchPunct('Pratique religieuse : modérée'), `Pratique religieuse${NB}: modérée`)
  assert.equal(frenchPunct('Vraiment ?'), `Vraiment${NB}?`)
})

test('matchTone strong at >= 80', () => {
  assert.equal(matchTone(85), 'strong')
  assert.equal(matchTone(80), 'strong')
  assert.equal(matchTone(79), 'normal')
})
