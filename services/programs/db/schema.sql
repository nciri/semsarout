-- Service programs — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE programs LOGIN PASSWORD 'programs';
CREATE SCHEMA IF NOT EXISTS programs AUTHORIZATION programs;
ALTER ROLE programs SET search_path = programs;
GRANT ALL ON SCHEMA programs TO programs;
