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

-- Réaligner la séquence pour les nouvelles inscriptions (register côté identity)
SELECT setval(pg_get_serial_sequence('identity.user_ro','id'), COALESCE((SELECT MAX(id) FROM identity.user_ro),1));

-- RBAC (lecture) : colonnes rôle étendues + permissions + associations
ALTER TABLE identity.role_ro ADD COLUMN IF NOT EXISTS description VARCHAR(255);
ALTER TABLE identity.role_ro ADD COLUMN IF NOT EXISTS color VARCHAR(20);
ALTER TABLE identity.role_ro ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
ALTER TABLE identity.role_ro ADD COLUMN IF NOT EXISTS agency_id INTEGER;

UPDATE identity.role_ro r SET description=p.description, color=p.color,
       is_system=p.is_system, agency_id=p.agency_id
FROM public.roles p WHERE p.id = r.id;

INSERT INTO identity.permission_ro (id, name, slug, description, module)
SELECT id, name, slug, description, module FROM public.permissions ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.role_permission_ro (role_id, permission_id)
SELECT role_id, permission_id FROM public.role_permissions ON CONFLICT DO NOTHING;

-- Seats : owner + limites du plan (max_seats/max_teams) pour la logique de quotas
ALTER TABLE identity.agency_ro ADD COLUMN IF NOT EXISTS owner_id INTEGER;
ALTER TABLE identity.agency_ro ADD COLUMN IF NOT EXISTS max_seats INTEGER DEFAULT 0;
ALTER TABLE identity.agency_ro ADD COLUMN IF NOT EXISTS max_teams INTEGER DEFAULT 0;
UPDATE identity.agency_ro ar SET owner_id=a.owner_id,
       max_seats=COALESCE(p.max_seats,0), max_teams=COALESCE(p.max_teams,0)
FROM public.agencies a
LEFT JOIN public.subscriptions s ON s.agency_id=a.id
LEFT JOIN public.subscription_plans p ON p.id=s.plan_id
WHERE a.id=ar.id;

SELECT setval(pg_get_serial_sequence('identity.role_ro','id'), COALESCE((SELECT MAX(id) FROM identity.role_ro),1));

-- Teams/invitations : nom d'agence pour l'affichage des invitations (tables team/invitation
-- créées vides par init_db — pas de données à migrer).
ALTER TABLE identity.agency_ro ADD COLUMN IF NOT EXISTS name VARCHAR(100);
UPDATE identity.agency_ro ar SET name=a.name FROM public.agencies a WHERE a.id=ar.id;
