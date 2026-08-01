-- Service agency — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE agency LOGIN PASSWORD 'agency';
CREATE SCHEMA IF NOT EXISTS agency AUTHORIZATION agency;
ALTER ROLE agency SET search_path = agency;
GRANT ALL ON SCHEMA agency TO agency;
