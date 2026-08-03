-- Service messaging — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE messaging LOGIN PASSWORD 'messaging';
CREATE SCHEMA IF NOT EXISTS messaging AUTHORIZATION messaging;
ALTER ROLE messaging SET search_path = messaging;
GRANT ALL ON SCHEMA messaging TO messaging;
