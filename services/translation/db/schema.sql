-- Service translation — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE translation LOGIN PASSWORD 'translation';
CREATE SCHEMA IF NOT EXISTS translation AUTHORIZATION translation;
ALTER ROLE translation SET search_path = translation;
GRANT ALL ON SCHEMA translation TO translation;
