-- Active l'entitlement design3d sur les plans qui le déclarent déjà.
--
-- migrate_design3d.sql a ajouté la colonne `has_design3d` (DEFAULT false), mais
-- rien d'autre ne la faisait passer à vrai en production : app/seed.py::seed_plans()
-- (qui porte has_design3d=True sur pro/enterprise) n'est appelée nulle part, et
-- aucune migration ne mettait le drapeau à jour sur les plans existants. Résultat :
-- plan_features() ne renvoyait jamais "design3d", et le module restait inaccessible
-- à toutes les agences malgré la migration déjà jouée — alors que l'écran
-- d'abonnement, seed.py et le message d'erreur serveur (« réservé aux plans Pro et
-- Entreprise ») présentent tous design3d comme inclus dans pro/enterprise.
--
-- Idempotente et rejouable : UPDATE ciblé par slug, ne touche ni `starter` ni aucun
-- autre drapeau.
UPDATE billing.subscription_plan
SET has_design3d = true
WHERE slug IN ('pro', 'enterprise');
