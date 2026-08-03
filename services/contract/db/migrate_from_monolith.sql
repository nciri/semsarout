-- Migration contract : monolithe -> contract. À exécuter AVANT le reroute BFF.
-- Modèles + contrats, plus projections de fusion (agency/property/client/transaction).

INSERT INTO contract.contract_template (
    id, agency_id, document_type, name, body_html, is_builtin, created_by, created_at, updated_at)
SELECT
    id, agency_id, document_type, name, body_html, is_builtin, created_by, created_at, updated_at
FROM public.contract_templates ON CONFLICT (id) DO NOTHING;

INSERT INTO contract.contract (
    id, agency_id, title, document_type, template_id, transaction_id, property_id, client_id,
    body_html, merge_context, status, pdf_url, created_by, finalized_at, signed_at, created_at, updated_at)
SELECT
    id, agency_id, title, document_type, template_id, transaction_id, property_id, client_id,
    body_html, merge_context, status, pdf_url, created_by, finalized_at, signed_at, created_at, updated_at
FROM public.contracts ON CONFLICT (id) DO NOTHING;

-- Projections de fusion (build_context).
INSERT INTO contract.agency_ro (id, name, address, license_number)
SELECT id, name, address, license_number FROM public.agencies ON CONFLICT (id) DO NOTHING;

INSERT INTO contract.property_ro (
    id, agency_id, address, city, property_type, price, surface, rooms, reference)
SELECT id, agency_id, address, city, property_type, price, surface, rooms, reference
FROM public.properties ON CONFLICT (id) DO NOTHING;

INSERT INTO contract.client_ro (id, agency_id, first_name, last_name, email, phone)
SELECT id, agency_id, first_name, last_name, email, phone FROM public.clients ON CONFLICT (id) DO NOTHING;

INSERT INTO contract.transaction_ro (
    id, agency_id, property_id, client_id, agent_id, transaction_type, reference,
    asking_price, commission_rate, commission_amount)
SELECT id, agency_id, property_id, client_id, agent_id, transaction_type, reference,
    asking_price, commission_rate, commission_amount
FROM public.transactions ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('contract.contract_template', 'id'), COALESCE((SELECT MAX(id) FROM contract.contract_template), 1));
SELECT setval(pg_get_serial_sequence('contract.contract', 'id'), COALESCE((SELECT MAX(id) FROM contract.contract), 1));
