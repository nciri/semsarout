-- Migration billing : monolithe -> billing. À exécuter AVANT le reroute BFF.
-- Plans + abonnements. (Pas de factures : la table publique n'existe pas dans le monolithe.)

INSERT INTO billing.subscription_plan (
    id, name, slug, description, max_listings, max_featured, max_urgent, has_api_access,
    has_csv_import, has_staymanager_sync, has_lead_contact, has_analytics, has_priority_support,
    has_dedicated_account_manager, has_programs, max_programs, has_contracts, has_legal,
    has_artisans, max_seats, max_teams, price_monthly, price_yearly, is_active, created_at)
SELECT
    id, name, slug, description, max_listings, max_featured, max_urgent, has_api_access,
    has_csv_import, has_staymanager_sync, has_lead_contact, has_analytics, has_priority_support,
    has_dedicated_account_manager, has_programs, max_programs, has_contracts, has_legal,
    has_artisans, max_seats, max_teams, price_monthly, price_yearly, is_active, created_at
FROM public.subscription_plans ON CONFLICT (id) DO NOTHING;

INSERT INTO billing.subscription (
    id, agency_id, plan_id, billing_cycle, amount, status, start_date, end_date, trial_end,
    cancelled_at, listings_used, featured_used, urgent_used, created_at, updated_at)
SELECT
    id, agency_id, plan_id, billing_cycle, amount, status, start_date, end_date, trial_end,
    cancelled_at, listings_used, featured_used, urgent_used, created_at, updated_at
FROM public.subscriptions ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('billing.subscription_plan', 'id'), COALESCE((SELECT MAX(id) FROM billing.subscription_plan), 1));
SELECT setval(pg_get_serial_sequence('billing.subscription', 'id'), COALESCE((SELECT MAX(id) FROM billing.subscription), 1));
