-- Service directory — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE directory LOGIN PASSWORD 'directory';
CREATE SCHEMA IF NOT EXISTS directory AUTHORIZATION directory;
ALTER ROLE directory SET search_path = directory;
GRANT ALL ON SCHEMA directory TO directory;
