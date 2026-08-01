-- Migration legal : monolithe -> legal. À exécuter AVANT le reroute BFF.
-- Projections d'appartenance : property_ro (id, agence, via listing.*),
-- transaction_ro (id, agence, type, référence, via transaction.*).

INSERT INTO legal.property_ro (id, agency_id)
SELECT id, agency_id FROM public.properties ON CONFLICT (id) DO NOTHING;

INSERT INTO legal.transaction_ro (id, agency_id, transaction_type, reference)
SELECT id, agency_id, transaction_type, reference FROM public.transactions ON CONFLICT (id) DO NOTHING;

INSERT INTO legal.notary (
    id, agency_id, name, office, city, phone, email, license_number, notes, created_at, updated_at)
SELECT
    id, agency_id, name, office, city, phone, email, license_number, notes, created_at, updated_at
FROM public.notaries ON CONFLICT (id) DO NOTHING;

INSERT INTO legal.legal_case (
    id, agency_id, transaction_id, property_id, notary_id, title, case_type, status, notes,
    created_by, created_at, updated_at)
SELECT
    id, agency_id, transaction_id, property_id, notary_id, title, case_type, status, notes,
    created_by, created_at, updated_at
FROM public.legal_cases ON CONFLICT (id) DO NOTHING;

INSERT INTO legal.legal_task (
    id, legal_case_id, label, status, due_date, assignee_id, position, notes, completed_at, created_at)
SELECT
    id, legal_case_id, label, status, due_date, assignee_id, position, notes, completed_at, created_at
FROM public.legal_tasks ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('legal.notary', 'id'), COALESCE((SELECT MAX(id) FROM legal.notary), 1));
SELECT setval(pg_get_serial_sequence('legal.legal_case', 'id'), COALESCE((SELECT MAX(id) FROM legal.legal_case), 1));
SELECT setval(pg_get_serial_sequence('legal.legal_task', 'id'), COALESCE((SELECT MAX(id) FROM legal.legal_task), 1));
