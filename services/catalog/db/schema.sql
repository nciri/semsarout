-- Service catalog — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE catalog LOGIN PASSWORD 'catalog';
CREATE SCHEMA IF NOT EXISTS catalog AUTHORIZATION catalog;
ALTER ROLE catalog SET search_path = catalog;
GRANT ALL ON SCHEMA catalog TO catalog;
