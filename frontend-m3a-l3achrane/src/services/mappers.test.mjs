import assert from 'node:assert/strict'
import test from 'node:test'

import { mapListingDetail, mapListingHit, mapProfile, mapSearchFilters } from './mappers.js'

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

test('mapProfile traduit le profil backend en clés françaises', () => {
  const p = mapProfile({
    user_id: 7, display_name: 'Sara', is_verified: true, gender: 'FEMME',
    city: 'Casablanca', bio: null, budget_min: 1000, budget_max: 2500,
    move_in_date: '2026-09-01',
    lifestyle: [
      { question_code: 'tabac', value: 'non-fumeur', importance: 'DECISIF' },
      { question_code: 'coucher', value: 'avant22', importance: 'PREFERENCE' },
    ],
  })
  assert.equal(p.prenom, 'Sara')
  assert.equal(p.verifiee, true)
  assert.deepEqual(p.lifestyle, ['Non-fumeur', 'Couche-tôt'])
  assert.deepEqual(p.lifestyleAnswers, { tabac: 'non-fumeur', coucher: 'avant22' })
  assert.deepEqual(p.lifestyleImportance, { tabac: 'decisive', coucher: 'preference' })
  assert.deepEqual(p.recherche, { ville: 'Casablanca', budgetMad: 2500, dispo: '01/09/2026' })
})

test('mapProfile tolère le profil vide', () => {
  const p = mapProfile({ user_id: 7, display_name: null, is_verified: false,
                         gender: null, city: null, budget_min: null, budget_max: null,
                         move_in_date: null, lifestyle: [] })
  assert.equal(p.prenom, '')
  assert.deepEqual(p.lifestyle, [])
  assert.deepEqual(p.lifestyleAnswers, {})
  assert.deepEqual(p.lifestyleImportance, {})
  assert.deepEqual(p.recherche, { ville: '', budgetMad: null, dispo: '' })
})

test('buildChips affiche les règles canoniques en français', () => {
  const l = mapListingHit({ ...HIT, rules: ['non-fumeur'], amenities: [] })
  assert.ok(l.chips.includes('Non-fumeur'))
})
