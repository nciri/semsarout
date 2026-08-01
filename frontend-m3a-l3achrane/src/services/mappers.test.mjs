import assert from 'node:assert/strict'
import test from 'node:test'

import { mapListingDetail, mapListingHit, mapSearchFilters } from './mappers.js'

const HIT = {
  listing_id: 'abc', title: 'Chambre à Gauthier', description: 'Belle chambre.',
  city: 'Casablanca', neighborhood: 'Gauthier', property_type: 'APPARTEMENT',
  bed_type: 'CHAMBRE_INDIVIDUELLE', housing_gender: 'FEMININ', furnished: true,
  rent: 2200, currency: 'MAD', capacity: 3, available_from: '2026-09-01',
  published_at: '2026-08-01T12:00:00+00:00',
  media_urls: ['/uploads/photos/a.jpg'], rules: ['Non-fumeur'],
  amenities: ['wifi'], status: 'PUBLIEE',
}

test('mapListingHit traduit le contrat backend vers les clés françaises', () => {
  const l = mapListingHit(HIT)
  assert.equal(l.id, 'abc')
  assert.equal(l.titre, 'Chambre à Gauthier')
  assert.equal(l.ville, 'Casablanca')
  assert.equal(l.quartier, 'Gauthier')
  assert.equal(l.prixMad, 2200)
  assert.deepEqual(l.photos, ['/uploads/photos/a.jpg'])
  assert.equal(l.matchPct, null) // le matching arrive au plan C
  assert.equal(l.verifiee, true) // publiée = passée en modération
  assert.ok(l.chips.includes('Non-fumeur') && l.chips.includes('Meublé') && l.chips.includes('Wifi'))
})

test('mapListingDetail produit equipements, facts et colocataires anonymes', () => {
  const d = mapListingDetail({
    ...HIT, id: 'abc', area_m2: 90, floor: 2,
    media: [{ url: '/uploads/photos/a.jpg', position: 0, media_type: 'CHAMBRE' }],
    house_rules: [{ code: 'fumeur', value: 'Non-fumeur' }],
    roommates: { total: 2, women: 2, men: 0 },
  })
  assert.equal(d.titre, 'Chambre à Gauthier')
  assert.equal(d.description, 'Belle chambre.')
  assert.ok(d.equipements.includes('Wifi'))
  assert.ok(d.facts.some((f) => f.label === 'Surface' && f.value === '90 m²'))
  assert.equal(d.colocataires.length, 2) // agrégat non nominatif → entrées anonymes
  assert.equal(d.colocataires[0].nom, 'Colocataire (F)')
})

test('mapSearchFilters traduit les filtres français en params API', () => {
  assert.deepEqual(
    mapSearchFilters({ ville: 'Rabat', budgetMax: 2500, genre: 'feminin', type: 'chambre', tri: 'prix-asc' }),
    { city: 'Rabat', max_rent: 2500, housing_gender: 'FEMININ', kind: 'chambre', sort: 'rent_asc' },
  )
  assert.deepEqual(mapSearchFilters({}), {})
})
