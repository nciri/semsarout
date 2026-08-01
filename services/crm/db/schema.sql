-- Service crm — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE crm LOGIN PASSWORD 'crm';
CREATE SCHEMA IF NOT EXISTS crm AUTHORIZATION crm;
ALTER ROLE crm SET search_path = crm;
GRANT ALL ON SCHEMA crm TO crm;
