-- Migration transactions : monolithe -> transactions. À exécuter AVANT le reroute BFF.
-- Projections dénormalisées : property_ro (titre/ville, puis maintenue par listing.*),
-- client_ro (nom, amorcée ici — crm n'émet pas encore d'événements client).

INSERT INTO transactions.property_ro (id, title, city)
SELECT id, title, city FROM public.properties ON CONFLICT (id) DO NOTHING;

INSERT INTO transactions.client_ro (id, first_name, last_name)
SELECT id, first_name, last_name FROM public.clients ON CONFLICT (id) DO NOTHING;

INSERT INTO transactions.transaction (
    id, reference, property_id, client_id, seller_id, agent_id, transaction_type, stage,
    stage_order, asking_price, offer_price, final_price, commission_rate, commission_amount,
    commission_split, status, lost_reason, contact_date, visit_date, offer_date, acceptance_date,
    compromise_date, closing_date, expected_closing_date, notes, probability, priority, agency_id,
    created_at, updated_at, closed_at)
SELECT
    id, reference, property_id, client_id, seller_id, agent_id, transaction_type, stage,
    stage_order, asking_price, offer_price, final_price, commission_rate, commission_amount,
    commission_split, status, lost_reason, contact_date, visit_date, offer_date, acceptance_date,
    compromise_date, closing_date, expected_closing_date, notes, probability, priority, agency_id,
    created_at, updated_at, closed_at
FROM public.transactions ON CONFLICT (id) DO NOTHING;

INSERT INTO transactions.offer (
    id, transaction_id, amount, conditions, offer_type, from_party, status, expires_at,
    response_notes, responded_at, created_at, created_by_id)
SELECT
    id, transaction_id, amount, conditions, offer_type, from_party, status, expires_at,
    response_notes, responded_at, created_at, created_by_id
FROM public.offers ON CONFLICT (id) DO NOTHING;

INSERT INTO transactions.transaction_document (
    id, transaction_id, document_type, name, file_url, file_size, mime_type, requires_signature,
    signature_status, signed_at, signature_url, uploaded_by_id, created_at)
SELECT
    id, transaction_id, document_type, name, file_url, file_size, mime_type, requires_signature,
    signature_status, signed_at, signature_url, uploaded_by_id, created_at
FROM public.transaction_documents ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('transactions.transaction', 'id'), COALESCE((SELECT MAX(id) FROM transactions.transaction), 1));
SELECT setval(pg_get_serial_sequence('transactions.offer', 'id'), COALESCE((SELECT MAX(id) FROM transactions.offer), 1));
SELECT setval(pg_get_serial_sequence('transactions.transaction_document', 'id'), COALESCE((SELECT MAX(id) FROM transactions.transaction_document), 1));
