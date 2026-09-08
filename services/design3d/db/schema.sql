-- Service design3d — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE design3d LOGIN PASSWORD 'design3d';
CREATE SCHEMA IF NOT EXISTS design3d AUTHORIZATION design3d;
ALTER ROLE design3d SET search_path = design3d;
GRANT ALL ON SCHEMA design3d TO design3d;
