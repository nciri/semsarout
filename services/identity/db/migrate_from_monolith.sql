-- Migration compte : monolithe -> identity. À exécuter AVANT le reroute BFF des routes /auth/*.
-- Projections user/role/agence. Le monolithe reste source de vérité pour les écritures ;
-- maintenu ensuite par les événements user.* (worker).

INSERT INTO identity.role_ro (id, slug, name, level)
SELECT id, slug, name, level FROM public.roles ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.user_ro (
    id, email, password_hash, first_name, last_name, phone, avatar_url, user_type,
    account_role, interest, is_active, is_verified, created_at, last_login, is_suspended,
    suspended_at, suspended_reason, deleted_at, anonymized_at, dashboard_config, agency_id, team_id)
SELECT
    id, email, password_hash, first_name, last_name, phone, avatar_url, user_type,
    account_role, interest, is_active, is_verified, created_at, last_login, is_suspended,
    suspended_at, suspended_reason, deleted_at, anonymized_at, dashboard_config, agency_id, team_id
FROM public.users ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.user_role_ro (user_id, role_id)
SELECT user_id, role_id FROM public.user_roles ON CONFLICT DO NOTHING;

-- Agence : statut modération (blocage login) + features du plan (claims JWT)
INSERT INTO identity.agency_ro (id, is_suspended, is_deleted, suspended_reason, features)
SELECT a.id, COALESCE(a.is_suspended,false), (a.deleted_at IS NOT NULL), a.suspended_reason,
       COALESCE((
         SELECT jsonb_agg(f) FROM (
           SELECT unnest(ARRAY[
             CASE WHEN p.has_artisans THEN 'artisans' END,
             CASE WHEN p.has_contracts THEN 'contracts' END,
             CASE WHEN p.has_legal THEN 'legal' END]) f
         ) x WHERE f IS NOT NULL
       ), '[]'::jsonb)
FROM public.agencies a
LEFT JOIN public.subscriptions s ON s.agency_id = a.id
LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
ON CONFLICT (id) DO NOTHING;
