-- Renouvellement et échec de paiement des abonnements (spec 2026-09-11-relance-paiement).
-- `grace_until` : échéance de grâce d'un renouvellement impayé (statut `past_due`).
-- `last_payment_failure_*` : dernier échec signalé par la passerelle, montré à l'agence.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS grace_until timestamp NULL;
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS last_payment_failure_at timestamp NULL;
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS last_payment_failure_reason varchar(255) NULL;
