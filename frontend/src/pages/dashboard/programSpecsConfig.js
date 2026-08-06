export const TYPOLOGY_OPTIONS = [
  { value: 'apartments', labelKey: 'programForm.specs.typology.apartments' },
  { value: 'villas', labelKey: 'programForm.specs.typology.villas' },
  { value: 'land', labelKey: 'programForm.specs.typology.land' },
  { value: 'commercial', labelKey: 'programForm.specs.typology.commercial' },
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
  apartments: { labelKey: 'programForm.specs.typology.apartments', fields: [
    { key: 'buildings_count', labelKey: 'programForm.specs.sections.apartments.fields.buildingsCount', type: 'number' },
    { key: 'floors_count', labelKey: 'programForm.specs.sections.apartments.fields.floorsCount', type: 'number' },
    { key: 'has_elevator', labelKey: 'programForm.specs.sections.apartments.fields.hasElevator', type: 'bool' },
    { key: 'monthly_charges', labelKey: 'programForm.specs.sections.apartments.fields.monthlyCharges', type: 'number' },
  ] },
  villas: { labelKey: 'programForm.specs.typology.villas', fields: [
    { key: 'land_surface_min', labelKey: 'programForm.specs.sections.villas.fields.landSurfaceMin', type: 'number' },
    { key: 'land_surface_max', labelKey: 'programForm.specs.sections.villas.fields.landSurfaceMax', type: 'number' },
    { key: 'levels', labelKey: 'programForm.specs.sections.villas.fields.levels', type: 'text' },
    { key: 'style', labelKey: 'programForm.specs.sections.villas.fields.style', type: 'text' },
    { key: 'has_garage', labelKey: 'programForm.specs.sections.villas.fields.hasGarage', type: 'bool' },
    { key: 'has_pool', labelKey: 'programForm.specs.sections.villas.fields.hasPool', type: 'bool' },
  ] },
  land: { labelKey: 'programForm.specs.typology.land', fields: [
    { key: 'serviced_water', labelKey: 'programForm.specs.sections.land.fields.servicedWater', type: 'bool' },
    { key: 'serviced_electricity', labelKey: 'programForm.specs.sections.land.fields.servicedElectricity', type: 'bool' },
    { key: 'serviced_sewage', labelKey: 'programForm.specs.sections.land.fields.servicedSewage', type: 'bool' },
    { key: 'serviced_road', labelKey: 'programForm.specs.sections.land.fields.servicedRoad', type: 'bool' },
    { key: 'title_type', labelKey: 'programForm.specs.sections.land.fields.titleType', type: 'text' },
    { key: 'buildability', labelKey: 'programForm.specs.sections.land.fields.buildability', type: 'text' },
    { key: 'subdivision_allowed', labelKey: 'programForm.specs.sections.land.fields.subdivisionAllowed', type: 'bool' },
  ] },
  commercial: { labelKey: 'programForm.specs.typology.commercial', fields: [
    { key: 'local_type', labelKey: 'programForm.specs.sections.commercial.fields.localType', type: 'select', options: [
      { value: 'office', labelKey: 'programForm.specs.localType.office' },
      { value: 'shop', labelKey: 'programForm.specs.localType.shop' },
      { value: 'warehouse', labelKey: 'programForm.specs.localType.warehouse' },
    ] },
    { key: 'allowed_use', labelKey: 'programForm.specs.sections.commercial.fields.allowedUse', type: 'text' },
    { key: 'standing', labelKey: 'programForm.specs.sections.commercial.fields.standing', type: 'text' },
  ] },
}

const APARTMENT_UNIT_FIELDS = [
  { key: 'floor', labelKey: 'programForm.specs.unitFields.apartmentUnit.floor', type: 'number' },
  { key: 'orientation', labelKey: 'programForm.specs.unitFields.apartmentUnit.orientation', type: 'text' },
  { key: 'has_balcony', labelKey: 'programForm.specs.unitFields.apartmentUnit.hasBalcony', type: 'bool' },
  { key: 'has_terrace', labelKey: 'programForm.specs.unitFields.apartmentUnit.hasTerrace', type: 'bool' },
]

// Champs specs par type d'unité → unit.specs.
export const UNIT_SPEC_FIELDS = {
  studio: APARTMENT_UNIT_FIELDS,
  apartment: APARTMENT_UNIT_FIELDS,
  duplex: APARTMENT_UNIT_FIELDS,
  penthouse: APARTMENT_UNIT_FIELDS,
  villa: [
    { key: 'land_surface', labelKey: 'programForm.specs.unitFields.villaUnit.landSurface', type: 'number' },
    { key: 'living_surface', labelKey: 'programForm.specs.unitFields.villaUnit.livingSurface', type: 'number' },
    { key: 'levels', labelKey: 'programForm.specs.unitFields.villaUnit.levels', type: 'text' },
    { key: 'has_garden', labelKey: 'programForm.specs.unitFields.villaUnit.hasGarden', type: 'bool' },
    { key: 'has_pool', labelKey: 'programForm.specs.unitFields.villaUnit.hasPool', type: 'bool' },
    { key: 'garage_spots', labelKey: 'programForm.specs.unitFields.villaUnit.garageSpots', type: 'number' },
  ],
  land: [
    { key: 'lot_surface', labelKey: 'programForm.specs.unitFields.landUnit.lotSurface', type: 'number' },
    { key: 'price_per_sqm', labelKey: 'programForm.specs.unitFields.landUnit.pricePerSqm', type: 'number' },
    { key: 'frontage', labelKey: 'programForm.specs.unitFields.landUnit.frontage', type: 'number' },
    { key: 'buildable', labelKey: 'programForm.specs.unitFields.landUnit.buildable', type: 'bool' },
    { key: 'shape', labelKey: 'programForm.specs.unitFields.landUnit.shape', type: 'text' },
  ],
  commercial: [
    { key: 'floor', labelKey: 'programForm.specs.unitFields.commercialUnit.floor', type: 'number' },
    { key: 'allowed_use', labelKey: 'programForm.specs.unitFields.commercialUnit.allowedUse', type: 'text' },
  ],
}

// Types d'unité pour lesquels on masque pièces/chambres/sdb.
export const UNIT_HIDE_ROOMS = ['land']
