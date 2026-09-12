-- Entitlement design3d (agenceur 3D) sur le plan d'abonnement.
ALTER TABLE billing.subscription_plan ADD COLUMN IF NOT EXISTS has_design3d BOOLEAN NOT NULL DEFAULT false;
