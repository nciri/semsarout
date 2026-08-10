-- Rôle + schéma dédiés au service partner (ADR-0002 : 1 rôle/schéma par service).
CREATE ROLE partner LOGIN PASSWORD 'partner';
CREATE SCHEMA IF NOT EXISTS partner AUTHORIZATION partner;
ALTER ROLE partner SET search_path = partner;
GRANT ALL ON SCHEMA partner TO partner;
