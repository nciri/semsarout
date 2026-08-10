import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCreatePayload, publish } from './orchestrate.mjs'

test('buildCreatePayload structure property + listing', () => {
  const p = buildCreatePayload({ city: 'Casa', property_type: 'APPARTEMENT', title: 'T',
    bed_type: 'CHAMBRE_INDIVIDUELLE', housing_gender: 'FEMININ', rent: 2500,
    is_condo: true, condo_fees: 800, photos: [] })
  assert.equal(p.property.city, 'Casa')
  assert.equal(p.is_condo, true)
  assert.equal(p.condo_fees, 800)
})

test('buildCreatePayload convertit les défauts chaîne vide en null pour les champs numériques', () => {
  const p = buildCreatePayload({
    city: 'Casa', property_type: 'APPARTEMENT', title: 'T', bed_type: 'CHAMBRE_INDIVIDUELLE',
    housing_gender: 'FEMININ', rent: 2500, capacity: '',
    floor: '', area_m2: '', charges_amount: '', deposit: '', condo_fees: '',
    duration_min_months: '', duration_max_months: '', is_condo: true, photos: [],
  })
  assert.equal(p.property.floor, null)
  assert.equal(p.property.area_m2, null)
  assert.equal(p.condo_fees, null)
  assert.equal(p.deposit, null)
  assert.equal(p.charges_amount, null)
  assert.equal(p.duration_min_months, null)
  assert.equal(p.duration_max_months, null)
  assert.equal(typeof p.rent, 'number')
  assert.equal(p.rent, 2500)
})

test('publish enchaîne create → media → submit', async () => {
  const calls = []
  const services = {
    createListing: async (pl) => { calls.push('create'); return { id: 'L1' } },
    uploadPhoto: async () => { calls.push('upload'); return '/uploads/photos/x.jpg' },
    addListingMedia: async () => { calls.push('media') },
    submitListing: async (id) => { calls.push('submit:' + id); return { status: 'EN_MODERATION' } },
  }
  const form = { city: 'Casa', property_type: 'APPARTEMENT', title: 'T', bed_type: 'CHAMBRE_INDIVIDUELLE',
    housing_gender: 'FEMININ', rent: 2500, is_condo: false,
    photos: [{ file: {}, media_type: 'CHAMBRE', position: 0 }] }
  const res = await publish(form, services)
  assert.deepEqual(calls, ['create', 'upload', 'media', 'submit:L1'])
  assert.equal(res.ok, true)
})
