-- Réamorce le repli auto-réparateur des entitlements pour les agences qui n'ont jamais pu
-- recevoir la feature `design3d`.
--
-- billing/migrate_design3d_entitlement.sql active `has_design3d` sur les plans pro et
-- enterprise, mais RIEN ne réémet `billing.subscription.activated`. Or les deux seuls chemins
-- qui alimentent `identity.agency_ro.features` sont cet événement (émis par le worker billing à
-- l'activation, la prolongation ou la résiliation d'un abonnement) et le repli synchrone de
-- `app.auth._features`, qui ne se déclenche que si `features_synced_at IS NULL` — marqueur que
-- add_features_synced_at.sql a justement posé sur toutes les agences porteuses de features.
-- Une agence Pro existante ne verrait donc jamais le module 3D avant sa prochaine activation
-- d'abonnement — jusqu'à un an en facturation annuelle — alors que l'écran d'abonnement, seed.py
-- et le message d'erreur serveur l'annoncent tous comme inclus dans pro/enterprise.
--
-- Le marqueur est remis à NULL pour les agences qui n'ont pas encore `design3d` : leur prochain
-- login rappellera billing UNE fois, obtiendra la liste à jour et réestampillera. Ce fichier
-- n'écrit AUCUNE feature : billing reste seule source de vérité, et seul un appel abouti
-- persiste quoi que ce soit côté identity — c'est exactement le contrat que pose le correctif
-- de `billing_client.features_of` / `auth._features`, et ce réamorçage s'appuie dessus au lieu
-- de le contredire.
--
-- L'autre piste (réémettre l'événement d'activation depuis le SQL) imposerait de réimplémenter
-- `billing.app.plans.plan_features()` dans l'outbox du schéma billing, donc de dupliquer la
-- dérivation des entitlements dans un langage où elle ne peut pas être testée : écartée.
--
-- À jouer APRÈS billing/migrate_design3d_entitlement.sql — sinon une agence qui se connecte
-- entre les deux réestampille une liste encore sans design3d, et le repli se rééteint.
--
-- Idempotente et rejouable : une fois le repli passé, `features` contient `design3d` et la
-- clause WHERE ne sélectionne plus la ligne.
UPDATE identity.agency_ro
SET features_synced_at = NULL
WHERE features_synced_at IS NOT NULL
  AND NOT (COALESCE(features, '[]')::jsonb @> '["design3d"]'::jsonb);
