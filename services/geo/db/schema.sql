-- Service geo — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE geo LOGIN PASSWORD 'geo';
CREATE SCHEMA IF NOT EXISTS geo AUTHORIZATION geo;
ALTER ROLE geo SET search_path = geo;
GRANT ALL ON SCHEMA geo TO geo;
