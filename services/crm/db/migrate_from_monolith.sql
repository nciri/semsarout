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

-- Stage B : clients + interactions
INSERT INTO crm.client (
    id, first_name, last_name, email, phone, phone_secondary, whatsapp, address, city,
    postal_code, client_type, status, source, source_detail, search_criteria, budget_min,
    budget_max, notes, next_follow_up, rating, tags, assigned_to_id, agency_id, lead_id,
    gdpr_consent, gdpr_consent_date, marketing_consent, created_at, updated_at, last_contact_at)
SELECT
    id, first_name, last_name, email, phone, phone_secondary, whatsapp, address, city,
    postal_code, client_type, status, source, source_detail, search_criteria, budget_min,
    budget_max, notes, next_follow_up, rating, tags, assigned_to_id, agency_id, lead_id,
    gdpr_consent, gdpr_consent_date, marketing_consent, created_at, updated_at, last_contact_at
FROM public.clients ON CONFLICT (id) DO NOTHING;

INSERT INTO crm.client_interaction (
    id, client_id, interaction_type, direction, subject, content, duration, property_id, created_by_id, created_at)
SELECT id, client_id, interaction_type, direction, subject, content, duration, property_id, created_by_id, created_at
FROM public.client_interactions ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('crm.client', 'id'), COALESCE((SELECT MAX(id) FROM crm.client), 1));
SELECT setval(pg_get_serial_sequence('crm.client_interaction', 'id'), COALESCE((SELECT MAX(id) FROM crm.client_interaction), 1));
