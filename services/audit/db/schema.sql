-- Service audit — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE audit LOGIN PASSWORD 'audit';
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION audit;
ALTER ROLE audit SET search_path = audit;
GRANT ALL ON SCHEMA audit TO audit;
