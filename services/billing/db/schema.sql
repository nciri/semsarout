-- Service billing — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
-- Mot de passe d'exemple local — utiliser un secret en réel.

CREATE ROLE billing LOGIN PASSWORD 'billing';
CREATE SCHEMA IF NOT EXISTS billing AUTHORIZATION billing;
ALTER ROLE billing SET search_path = billing;
GRANT ALL ON SCHEMA billing TO billing;
