-- Migration agency : monolithe -> service. À exécuter AVANT le reroute BFF.
-- agency = source de vérité ; listing_ro (id, agency_id) = projection pour properties_count.
INSERT INTO agency.agency (
    id, name, slug, description, email, phone, website, address, city, postal_code,
    logo_url, cover_image_url, license_number, rc_number, ice_number, staymanager_id, api_key,
    is_verified, is_active, created_at, updated_at, is_suspended, suspended_at, suspended_reason,
    deleted_at, anonymized_at, owner_id)
SELECT
    id, name, slug, description, email, phone, website, address, city, postal_code,
    logo_url, cover_image_url, license_number, rc_number, ice_number, staymanager_id, api_key,
    is_verified, is_active, created_at, updated_at, is_suspended, suspended_at, suspended_reason,
    deleted_at, anonymized_at, owner_id
FROM public.agencies ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('agency.agency','id'), COALESCE((SELECT MAX(id) FROM agency.agency),1));

INSERT INTO agency.listing_ro (
    id, agency_id, reference, title, price, city, property_type, transaction_type,
    surface, rooms, bedrooms, status, published_at)
SELECT id, agency_id, reference, title, price, city, property_type, transaction_type,
    surface, rooms, bedrooms, status, published_at
FROM public.properties ON CONFLICT (id) DO NOTHING;
