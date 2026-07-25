-- Migration audit : monolithe -> service. activity_log = projection (source = writers via
-- audit.logged) ; user_ro (noms) pour user_name. À exécuter AVANT le reroute BFF.
INSERT INTO audit.activity_log (id, user_id, action, entity_type, entity_id, extra_data, ip_address, agency_id, created_at)
SELECT id, user_id, action, entity_type, entity_id, extra_data, ip_address, agency_id, created_at
FROM public.activity_logs ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('audit.activity_log','id'), COALESCE((SELECT MAX(id) FROM audit.activity_log),1));

INSERT INTO audit.user_ro (id, first_name, last_name)
SELECT id, first_name, last_name FROM public.users ON CONFLICT (id) DO NOTHING;
