-- Service analytics — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
-- Mot de passe d'exemple local — utiliser un secret en réel.

CREATE ROLE analytics LOGIN PASSWORD 'analytics';
CREATE SCHEMA IF NOT EXISTS analytics AUTHORIZATION analytics;
ALTER ROLE analytics SET search_path = analytics;
GRANT ALL ON SCHEMA analytics TO analytics;
