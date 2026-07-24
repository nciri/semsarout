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

-- Stage C : visites + événements de calendrier (property_ro enrichie : titre+adresse+ville)
UPDATE crm.property_ro ro SET address = p.address, city = p.city FROM public.properties p WHERE p.id = ro.id;

INSERT INTO crm.visit (
    id, property_id, client_id, visitor_name, visitor_email, visitor_phone, agent_id,
    scheduled_at, duration_minutes, status, visit_type, notes, internal_notes, report,
    client_feedback, client_comments, confirmed_at, confirmation_method, agency_id,
    created_at, updated_at, completed_at, cancelled_at, cancellation_reason)
SELECT
    id, property_id, client_id, visitor_name, visitor_email, visitor_phone, agent_id,
    scheduled_at, duration_minutes, status, visit_type, notes, internal_notes, report,
    client_feedback, client_comments, confirmed_at, confirmation_method, agency_id,
    created_at, updated_at, completed_at, cancelled_at, cancellation_reason
FROM public.visits ON CONFLICT (id) DO NOTHING;

INSERT INTO crm.calendar_event (
    id, title, description, event_type, start_at, end_at, all_day, recurrence, location,
    attendees, client_id, property_id, user_id, agency_id, status, color, created_at, updated_at)
SELECT
    id, title, description, event_type, start_at, end_at, all_day, recurrence, location,
    attendees, client_id, property_id, user_id, agency_id, status, color, created_at, updated_at
FROM public.calendar_events ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('crm.visit', 'id'), COALESCE((SELECT MAX(id) FROM crm.visit), 1));
SELECT setval(pg_get_serial_sequence('crm.calendar_event', 'id'), COALESCE((SELECT MAX(id) FROM crm.calendar_event), 1));

-- Projection transactions (domaine futur) : compte `transactions_count` par client.
INSERT INTO crm.transaction_ro (id, client_id)
SELECT id, client_id FROM public.transactions ON CONFLICT (id) DO NOTHING;
