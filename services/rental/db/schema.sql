-- Service rental (gestion locative) — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE rental LOGIN PASSWORD 'rental';
CREATE SCHEMA IF NOT EXISTS rental AUTHORIZATION rental;
ALTER ROLE rental SET search_path = rental;
GRANT ALL ON SCHEMA rental TO rental;
