const numOrNull = (v) => (v === '' || v == null ? null : Number(v))

export function buildCreatePayload(f) {
  return {
    property: { city: f.city, neighborhood: f.neighborhood || null, address: f.address || null,
                property_type: f.property_type, floor: numOrNull(f.floor), area_m2: numOrNull(f.area_m2),
                amenities: f.amenities || {} },
    title: f.title, description: f.description || '', bed_type: f.bed_type,
    rent: Number(f.rent), charges_included: !!f.charges_included,
    charges_amount: numOrNull(f.charges_amount), deposit: numOrNull(f.deposit),
    furnished: !!f.furnished, housing_gender: f.housing_gender, capacity: Number(f.capacity || 1),
    available_from: f.available_from || null, duration_min_months: numOrNull(f.duration_min_months),
    duration_max_months: numOrNull(f.duration_max_months),
    is_condo: !!f.is_condo, condo_fees: f.is_condo ? numOrNull(f.condo_fees) : null,
  }
}

export async function publish(form, s) {
  const listing = await s.createListing(buildCreatePayload(form))
  for (const [i, ph] of (form.photos || []).entries()) {
    const url = await s.uploadPhoto(ph.file)
    await s.addListingMedia(listing.id, { url, position: ph.position ?? i, media_type: ph.media_type || 'AUTRE' })
  }
  await s.submitListing(listing.id)
  return { ok: true, id: listing.id }
}
