-- Migration buyer : monolithe -> buyer. À exécuter AVANT le reroute BFF.
-- property_ro (réduite) amorcée depuis public.properties (puis maintenue par listing.*).
-- saved_searches/favorites/property_estimates : copiés (0 ligne actuellement, INSERT idempotent).

INSERT INTO buyer.property_ro (
    id, reference, title, price, city, property_type, transaction_type, surface, rooms, bedrooms, status)
SELECT id, reference, title, price, city, property_type, transaction_type, surface, rooms, bedrooms, status
FROM public.properties ON CONFLICT (id) DO NOTHING;

INSERT INTO buyer.saved_search (
    id, user_id, name, description, criteria, notify_new_matches, last_notified_at, created_at, updated_at)
SELECT id, user_id, name, description, criteria, notify_new_matches, last_notified_at, created_at, updated_at
FROM public.saved_searches ON CONFLICT (id) DO NOTHING;

INSERT INTO buyer.favorite (id, user_id, property_id, notes, rating, created_at)
SELECT id, user_id, property_id, notes, rating, created_at
FROM public.favorites ON CONFLICT (id) DO NOTHING;

INSERT INTO buyer.property_estimate (
    id, user_id, property_id, estimated_price, estimated_reason, market_analysis,
    comparison_properties, created_at, updated_at)
SELECT id, user_id, property_id, estimated_price, estimated_reason, market_analysis,
    comparison_properties, created_at, updated_at
FROM public.property_estimates ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('buyer.saved_search', 'id'), COALESCE((SELECT MAX(id) FROM buyer.saved_search), 1));
SELECT setval(pg_get_serial_sequence('buyer.favorite', 'id'), COALESCE((SELECT MAX(id) FROM buyer.favorite), 1));
SELECT setval(pg_get_serial_sequence('buyer.property_estimate', 'id'), COALESCE((SELECT MAX(id) FROM buyer.property_estimate), 1));
