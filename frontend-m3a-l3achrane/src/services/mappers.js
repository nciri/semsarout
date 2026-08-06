// Traduction du contrat backend (anglais) vers les clés françaises des composants.
// Fonctions pures — testées par mappers.test.mjs (node --test).

const AMENITY_LABELS = {
  wifi: 'Wifi', machine_a_laver: 'Machine à laver', climatisation: 'Climatisation',
  parking: 'Parking', ascenseur: 'Ascenseur', terrasse: 'Terrasse',
}

const GENDER_PARAMS = { feminin: 'FEMININ', masculin: 'MASCULIN' }
const SORT_PARAMS = { pertinence: 'relevance', 'prix-asc': 'rent_asc', 'prix-desc': 'rent_desc', recent: 'recent' }

const amenityLabel = (code) => AMENITY_LABELS[code] ?? code.replaceAll('_', ' ')

// Valeurs canoniques du référentiel lifestyle 13 questions (libs/semsar_common/coloc_referential.py)
// → libellés FR courts. Partagé par les chips d'annonce (house_rules) et le questionnaire (mapProfile).
const LIFESTYLE_LABELS = {
  // coucher
  avant22: 'Couche-tôt', '22h-minuit': 'Couche vers minuit', 'apres-minuit': 'Couche-tard',
  // travail
  jour: 'Travail de jour', decale: 'Horaires décalés', teletravail: 'Télétravail',
  // weekend
  maison: 'Weekend à la maison', sorti: 'Weekend dehors', 'ca-depend': 'Weekend variable',
  // menage
  quotidien: 'Ménage quotidien', '2-3-semaine': 'Ménage 2-3x/semaine', hebdomadaire: 'Ménage hebdomadaire',
  // vaisselle
  immediat: 'Vaisselle immédiate', 'jour-meme': 'Vaisselle le jour même', beaucoup: 'Vaisselle en retard',
  // tabac
  'non-fumeur': 'Non-fumeur', balcon: 'Fumeur au balcon', interieur: 'Fumeur en intérieur',
  // alcool
  jamais: 'Sans alcool', occasionnel: 'Alcool occasionnel', regulier: 'Alcool régulier',
  // invites
  rarement: 'Invités occasionnels', mensuel: 'Invités mensuels', souvent: 'Invités fréquents',
  // bruit
  casque: 'Calme (casque)', modere: 'Bruit modéré', 'sans-contrainte': 'Bruit sans contrainte',
  // cuisine
  separee: 'Cuisine séparée', parfois: 'Cuisine parfois partagée', ensemble: 'Cuisine partagée',
  // charges
  chacun: 'Charges séparées', commune: 'Charges communes', 'a-definir': 'Charges à définir',
  // social
  amis: 'Sociable entre amis', voisinage: 'Sociable avec le voisinage', 'peu-importe': 'Sociabilité indifférente',
  // langue
  darija: 'Darija', francais: 'Français', indifferent: 'Langue indifférente',
}

export const lifestyleLabel = (value) => LIFESTYLE_LABELS[value] ?? value.replaceAll('_', ' ')

// Mapping importance backend (coloc-profile) <-> front (Questionnaire.jsx / IMPORTANCE_LEVELS).
const IMPORTANCE_FROM_BACKEND = { INDIFFERENT: 'neutral', PREFERENCE: 'preference', DECISIF: 'decisive' }

export function buildChips(source) {
  const chips = (source.rules ?? []).map(lifestyleLabel)
  if (source.furnished) chips.push('Meublé')
  for (const code of source.amenities ?? []) chips.push(amenityLabel(code))
  return chips
}

export function mapListingHit(hit) {
  return {
    id: hit.listing_id,
    titre: hit.title,
    ville: hit.city,
    quartier: hit.neighborhood ?? '',
    prixMad: Math.round(hit.rent),
    photos: hit.media_urls ?? [],
    matchPct: hit.match_pct ?? null, // absent tant que le matching (plan C) n'est pas branché
    verifiee: hit.status === 'PUBLIEE', // publiée = passée en modération
    chips: buildChips(hit),
  }
}

export function mapListingDetail(d) {
  const facts = []
  if (d.area_m2 != null) facts.push({ label: 'Surface', value: `${d.area_m2} m²` })
  if (d.floor != null) facts.push({ label: 'Étage', value: String(d.floor) })
  if (d.capacity != null) facts.push({ label: 'Colocataires', value: String(d.capacity) })
  if (d.available_from) {
    facts.push({ label: 'Disponible', value: new Date(d.available_from).toLocaleDateString('fr-FR') })
  }
  const roommates = d.roommates ?? null
  const colocataires = []
  if (roommates) {
    for (let i = 0; i < roommates.women; i += 1) colocataires.push({ nom: 'Colocataire (F)', avatar: null })
    for (let i = 0; i < roommates.men; i += 1) colocataires.push({ nom: 'Colocataire (H)', avatar: null })
  }
  return {
    id: d.id,
    titre: d.title,
    ville: d.city,
    quartier: d.neighborhood ?? '',
    prixMad: Math.round(d.rent),
    photos: (d.media ?? []).map((m) => m.url),
    matchPct: d.match_pct ?? null,
    verifiee: d.status === 'PUBLIEE',
    chips: buildChips({ rules: (d.house_rules ?? []).map((r) => r.value), furnished: d.furnished, amenities: d.amenities }),
    description: d.description ?? '',
    equipements: (d.amenities ?? []).map(amenityLabel),
    facts,
    colocataires,
  }
}

export function mapSearchFilters(filtres = {}) {
  const params = {}
  if (filtres.ville) params.city = filtres.ville
  if (filtres.quartier) params.neighborhood = filtres.quartier
  if (filtres.budgetMax != null) params.max_rent = filtres.budgetMax
  if (filtres.budgetMin != null) params.min_rent = filtres.budgetMin
  if (GENDER_PARAMS[filtres.genre]) params.housing_gender = GENDER_PARAMS[filtres.genre]
  if (filtres.type) params.kind = filtres.type
  if (filtres.q) params.q = filtres.q
  if (SORT_PARAMS[filtres.tri]) params.sort = SORT_PARAMS[filtres.tri]
  return params
}

export function mapProfile(p) {
  const lifestyleAnswers = p.lifestyle ?? []
  return {
    prenom: p.display_name ?? '',
    avatar: null,
    verifiee: Boolean(p.is_verified),
    lifestyle: lifestyleAnswers.map((a) => lifestyleLabel(a.value)),
    // question_code → value / question_code → niveau front, pour pré-remplir le questionnaire.
    lifestyleAnswers: Object.fromEntries(lifestyleAnswers.map((a) => [a.question_code, a.value])),
    lifestyleImportance: Object.fromEntries(
      lifestyleAnswers.map((a) => [a.question_code, IMPORTANCE_FROM_BACKEND[a.importance] ?? 'preference']),
    ),
    recherche: {
      ville: p.city ?? '',
      budgetMad: p.budget_max != null ? Math.round(p.budget_max) : null,
      dispo: p.move_in_date ? new Date(p.move_in_date).toLocaleDateString('fr-FR') : '',
    },
  }
}
