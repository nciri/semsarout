-- Migration messaging : monolithe -> service messaging. À exécuter AVANT le reroute BFF.
-- buyer_message = source de vérité ; listing_ro = projection (existence des biens) amorcée.
INSERT INTO messaging.buyer_message (
    id, buyer_id, property_id, subject, message, buyer_email, buyer_phone, status, created_at, read_at)
SELECT
    id, buyer_id, property_id, subject, message, buyer_email, buyer_phone, status, created_at, read_at
FROM public.buyer_messages ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('messaging.buyer_message', 'id'),
              COALESCE((SELECT MAX(id) FROM messaging.buyer_message), 1));

INSERT INTO messaging.listing_ro (id) SELECT id FROM public.properties ON CONFLICT (id) DO NOTHING;
