-- Migration payment : monolithe -> payment. À exécuter AVANT le reroute BFF.
-- plan_ro (prix par slug) pour le calcul du montant des paiements d'abonnement, plus les
-- paiements existants (le cas échéant).

INSERT INTO payment.plan_ro (id, slug, price_monthly, price_yearly)
SELECT id, slug, price_monthly, price_yearly FROM public.subscription_plans ON CONFLICT (id) DO NOTHING;

INSERT INTO payment.payment (
    id, reference, payment_type, service_id, plan_id, billing_cycle, amount, currency, status,
    payment_method, gateway_reference, user_id, customer_name, customer_email, customer_phone,
    customer_address, customer_city, created_at, completed_at, extra_data)
SELECT
    id, reference, payment_type, service_id, plan_id, billing_cycle, amount, currency, status,
    payment_method, gateway_reference, user_id, customer_name, customer_email, customer_phone,
    customer_address, customer_city, created_at, completed_at, extra_data
FROM public.payments ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('payment.payment', 'id'), COALESCE((SELECT MAX(id) FROM payment.payment), 1));
