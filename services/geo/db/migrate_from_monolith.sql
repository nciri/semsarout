-- Migration geo : monolithe -> service geo. À exécuter AVANT le reroute BFF.
-- neighborhood_price_ref = source de vérité ; listing_ro = projection amorcée depuis
-- public.properties (puis maintenue par les événements listing.*).

INSERT INTO geo.neighborhood_price_ref (
    id, city, neighborhood, property_type, transaction_type,
    avg_price_sqm, min_price_sqm, max_price_sqm, source, created_at, updated_at)
SELECT
    id, city, neighborhood, property_type, transaction_type,
    avg_price_sqm, min_price_sqm, max_price_sqm, source, created_at, updated_at
FROM public.neighborhood_price_refs ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('geo.neighborhood_price_ref', 'id'),
              COALESCE((SELECT MAX(id) FROM geo.neighborhood_price_ref), 1));

INSERT INTO geo.listing_ro (
    id, price, price_per_sqm, surface, city, neighborhood, property_type, transaction_type, status)
SELECT
    id, price, price_per_sqm, surface, city, neighborhood, property_type, transaction_type, status
FROM public.properties ON CONFLICT (id) DO NOTHING;
