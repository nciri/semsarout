-- Migration leads : monolithe -> crm. À exécuter AVANT le reroute BFF.
-- property_ro (titres) est amorcé depuis public.properties (puis maintenu par listing.*).

INSERT INTO crm.property_ro (id, title)
SELECT id, title FROM public.properties ON CONFLICT (id) DO NOTHING;

INSERT INTO crm.lead (
    id, name, email, phone, message, notes, source, service, status, lost_reason, lost_at,
    property_id, agency_id, assigned_to_id, is_charged, is_read, read_at,
    created_at, updated_at, contacted_at, qualified_at, converted_at)
SELECT
    id, name, email, phone, message, notes, source, service, status, lost_reason, lost_at,
    property_id, agency_id, assigned_to_id, is_charged, is_read, read_at,
    created_at, updated_at, contacted_at, qualified_at, converted_at
FROM public.leads ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('crm.lead', 'id'), COALESCE((SELECT MAX(id) FROM crm.lead), 1));
