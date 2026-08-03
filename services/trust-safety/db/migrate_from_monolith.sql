-- Migration trust-safety : monolithe -> service. À exécuter AVANT le reroute BFF.
-- moderation_status amorcé depuis public (comptes suspendus/supprimés) — devient la source
-- du masquage (§6). Maintenu ensuite par les routes suspend/unsuspend + événements account.*.
INSERT INTO trust_safety.moderation_status (entity_type, entity_id, is_suspended, is_deleted, reason)
SELECT 'user', id, COALESCE(is_suspended, false), (deleted_at IS NOT NULL), NULL
FROM public.users WHERE COALESCE(is_suspended,false) OR deleted_at IS NOT NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO trust_safety.moderation_status (entity_type, entity_id, is_suspended, is_deleted, reason)
SELECT 'agency', id, COALESCE(is_suspended, false), (deleted_at IS NOT NULL), NULL
FROM public.agencies WHERE COALESCE(is_suspended,false) OR deleted_at IS NOT NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;
