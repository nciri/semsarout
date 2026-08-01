-- Migration programs : monolithe -> programs. À exécuter AVANT le reroute BFF.
-- agency_ro (nom/téléphone) amorcée depuis public.agencies.

INSERT INTO programs.agency_ro (id, name, phone)
SELECT id, name, phone FROM public.agencies ON CONFLICT (id) DO NOTHING;

INSERT INTO programs.program (
    id, reference, name, slug, description, program_type, address, city, neighborhood, latitude,
    longitude, total_units, available_units, min_price, max_price, delivery_date, construction_status,
    amenities, cover_image_url, brochure_url, video_url, status, agency_id, created_by_id,
    created_at, updated_at, published_at, views_count, contacts_count)
SELECT
    id, reference, name, slug, description, program_type, address, city, neighborhood, latitude,
    longitude, total_units, available_units, min_price, max_price, delivery_date, construction_status,
    amenities, cover_image_url, brochure_url, video_url, status, agency_id, created_by_id,
    created_at, updated_at, published_at, views_count, contacts_count
FROM public.programs ON CONFLICT (id) DO NOTHING;

INSERT INTO programs.program_unit (
    id, program_id, name, unit_type, surface_min, surface_max, rooms, bedrooms, bathrooms,
    price_from, price_to, total_count, available_count, features, floor_plan_url, created_at, updated_at)
SELECT
    id, program_id, name, unit_type, surface_min, surface_max, rooms, bedrooms, bathrooms,
    price_from, price_to, total_count, available_count, features, floor_plan_url, created_at, updated_at
FROM public.program_units ON CONFLICT (id) DO NOTHING;

INSERT INTO programs.program_image (id, program_id, url, caption, image_type, position)
SELECT id, program_id, url, caption, image_type, position FROM public.program_images ON CONFLICT (id) DO NOTHING;

INSERT INTO programs.program_unit_image (id, unit_id, url, caption, image_type, position, created_at)
SELECT id, unit_id, url, caption, image_type, position, created_at FROM public.program_unit_images ON CONFLICT (id) DO NOTHING;

INSERT INTO programs.program_plan (id, program_id, name, image_url, position, created_at, updated_at)
SELECT id, program_id, name, image_url, position, created_at, updated_at FROM public.program_plans ON CONFLICT (id) DO NOTHING;

INSERT INTO programs.program_lot (
    id, program_id, plan_id, reference, title, lot_type, surface, rooms, bedrooms, bathrooms,
    floor, price, status, zone, description, image_url, created_at, updated_at)
SELECT
    id, program_id, plan_id, reference, title, lot_type, surface, rooms, bedrooms, bathrooms,
    floor, price, status, zone, description, image_url, created_at, updated_at
FROM public.program_lots ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('programs.program', 'id'), COALESCE((SELECT MAX(id) FROM programs.program), 1));
SELECT setval(pg_get_serial_sequence('programs.program_unit', 'id'), COALESCE((SELECT MAX(id) FROM programs.program_unit), 1));
SELECT setval(pg_get_serial_sequence('programs.program_image', 'id'), COALESCE((SELECT MAX(id) FROM programs.program_image), 1));
SELECT setval(pg_get_serial_sequence('programs.program_unit_image', 'id'), COALESCE((SELECT MAX(id) FROM programs.program_unit_image), 1));
SELECT setval(pg_get_serial_sequence('programs.program_plan', 'id'), COALESCE((SELECT MAX(id) FROM programs.program_plan), 1));
SELECT setval(pg_get_serial_sequence('programs.program_lot', 'id'), COALESCE((SELECT MAX(id) FROM programs.program_lot), 1));
