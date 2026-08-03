-- Service contract — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
-- Mot de passe d'exemple local — utiliser un secret en réel.

CREATE ROLE contract LOGIN PASSWORD 'contract';
CREATE SCHEMA IF NOT EXISTS contract AUTHORIZATION contract;
ALTER ROLE contract SET search_path = contract;
GRANT ALL ON SCHEMA contract TO contract;
