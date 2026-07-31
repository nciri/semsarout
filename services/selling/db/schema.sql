-- Service selling — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE selling LOGIN PASSWORD 'selling';
CREATE SCHEMA IF NOT EXISTS selling AUTHORIZATION selling;
ALTER ROLE selling SET search_path = selling;
GRANT ALL ON SCHEMA selling TO selling;
