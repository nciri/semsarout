export const TYPOLOGY_OPTIONS = [
  { value: 'apartments', label: 'Appartements' },
  { value: 'villas', label: 'Villas' },
  { value: 'land', label: 'Terrains' },
  { value: 'commercial', label: 'Commercial' },
]

// Types d'unité proposés par typologie (union quand plusieurs cochées).
export const UNIT_TYPES_BY_TYPOLOGY = {
  apartments: ['studio', 'apartment', 'duplex', 'penthouse'],
  villas: ['villa', 'duplex'],
  land: ['land'],
  commercial: ['commercial'],
}

export const unitTypesForTypology = (typology = []) => {
  const set = new Set()
  typology.forEach(t => (UNIT_TYPES_BY_TYPOLOGY[t] || []).forEach(u => set.add(u)))
  return [...set]
}

// Champs de l'étape Détails par typologie → formData.specs[typology].
export const DETAIL_SECTIONS = {
  apartments: { label: 'Appartements', fields: [
    { key: 'buildings_count', label: 'Nombre de bâtiments', type: 'number' },
    { key: 'floors_count', label: "Nombre d'étages", type: 'number' },
    { key: 'has_elevator', label: 'Ascenseur', type: 'bool' },
    { key: 'monthly_charges', label: 'Charges/syndic estimées (Đh/mois)', type: 'number' },
  ] },
  villas: { label: 'Villas', fields: [
    { key: 'land_surface_min', label: 'Superficie terrain min (m²)', type: 'number' },
    { key: 'land_surface_max', label: 'Superficie terrain max (m²)', type: 'number' },
    { key: 'levels', label: 'Niveaux (ex. R+1)', type: 'text' },
    { key: 'style', label: 'Style architectural', type: 'text' },
    { key: 'has_garage', label: 'Garage', type: 'bool' },
    { key: 'has_pool', label: 'Piscine', type: 'bool' },
  ] },
  land: { label: 'Terrains', fields: [
    { key: 'serviced_water', label: 'Eau', type: 'bool' },
    { key: 'serviced_electricity', label: 'Électricité', type: 'bool' },
    { key: 'serviced_sewage', label: 'Assainissement', type: 'bool' },
    { key: 'serviced_road', label: 'Voirie', type: 'bool' },
    { key: 'title_type', label: 'Type de titre foncier', type: 'text' },
    { key: 'buildability', label: 'Constructibilité (COS/CUS ou R+n)', type: 'text' },
    { key: 'subdivision_allowed', label: 'Lotissement autorisé', type: 'bool' },
  ] },
  commercial: { label: 'Commercial', fields: [
    { key: 'local_type', label: 'Type de local', type: 'select', options: [
      { value: 'office', label: 'Bureau' }, { value: 'shop', label: 'Commerce' }, { value: 'warehouse', label: 'Entrepôt' },
    ] },
    { key: 'allowed_use', label: 'Usage autorisé', type: 'text' },
    { key: 'standing', label: 'Standing', type: 'text' },
  ] },
}

const APARTMENT_UNIT_FIELDS = [
  { key: 'floor', label: 'Étage', type: 'number' },
  { key: 'orientation', label: 'Orientation', type: 'text' },
  { key: 'has_balcony', label: 'Balcon', type: 'bool' },
  { key: 'has_terrace', label: 'Terrasse', type: 'bool' },
]

// Champs specs par type d'unité → unit.specs.
export const UNIT_SPEC_FIELDS = {
  studio: APARTMENT_UNIT_FIELDS,
  apartment: APARTMENT_UNIT_FIELDS,
  duplex: APARTMENT_UNIT_FIELDS,
  penthouse: APARTMENT_UNIT_FIELDS,
  villa: [
    { key: 'land_surface', label: 'Superficie terrain (m²)', type: 'number' },
    { key: 'living_surface', label: 'Superficie habitable (m²)', type: 'number' },
    { key: 'levels', label: 'Niveaux', type: 'text' },
    { key: 'has_garden', label: 'Jardin', type: 'bool' },
    { key: 'has_pool', label: 'Piscine', type: 'bool' },
    { key: 'garage_spots', label: 'Places de garage', type: 'number' },
  ],
  land: [
    { key: 'lot_surface', label: 'Superficie lot (m²)', type: 'number' },
    { key: 'price_per_sqm', label: 'Prix/m² (Đh)', type: 'number' },
    { key: 'frontage', label: 'Façade (ml)', type: 'number' },
    { key: 'buildable', label: 'Constructible', type: 'bool' },
    { key: 'shape', label: 'Forme', type: 'text' },
  ],
  commercial: [
    { key: 'floor', label: 'Étage', type: 'number' },
    { key: 'allowed_use', label: 'Usage', type: 'text' },
  ],
}

// Types d'unité pour lesquels on masque pièces/chambres/sdb.
export const UNIT_HIDE_ROOMS = ['land']
