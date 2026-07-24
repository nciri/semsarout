-- Migration biens : monolithe (public.*) -> service listing. À exécuter AVANT le reroute BFF.
-- Colonnes alignées sur les modèles listing (Property/PropertyImage/PropertyDocument).

INSERT INTO listing.property (
    id, reference, title, description, property_type, transaction_type, price, price_per_sqm,
    charges, surface, land_surface, rooms, bedrooms, bathrooms, floor, total_floors,
    construction_year, features, energy_class, ges_class, address, city, neighborhood,
    postal_code, latitude, longitude, status, is_premium, is_urgent, urgent_until, is_featured,
    boost_until, views_count, contacts_count, favorites_count, owner_id, agency_id,
    created_at, updated_at, published_at)
SELECT
    id, reference, title, description, property_type, transaction_type, price, price_per_sqm,
    charges, surface, land_surface, rooms, bedrooms, bathrooms, floor, total_floors,
    construction_year, features, energy_class, ges_class, address, city, neighborhood,
    postal_code, latitude, longitude, status, is_premium, is_urgent, urgent_until, is_featured,
    boost_until, views_count, contacts_count, favorites_count, owner_id, agency_id,
    created_at, updated_at, published_at
FROM public.properties ON CONFLICT (id) DO NOTHING;

INSERT INTO listing.property_image (id, property_id, url, thumbnail_url, caption, position, is_primary)
SELECT id, property_id, url, thumbnail_url, caption, position, is_primary
FROM public.property_images ON CONFLICT (id) DO NOTHING;

INSERT INTO listing.property_document (id, property_id, doc_type, file_url, original_name, created_at)
SELECT id, property_id, doc_type, file_url, original_name, created_at
FROM public.property_documents ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('listing.property', 'id'), COALESCE((SELECT MAX(id) FROM listing.property), 1));
SELECT setval(pg_get_serial_sequence('listing.property_image', 'id'), COALESCE((SELECT MAX(id) FROM listing.property_image), 1));
SELECT setval(pg_get_serial_sequence('listing.property_document', 'id'), COALESCE((SELECT MAX(id) FROM listing.property_document), 1));
