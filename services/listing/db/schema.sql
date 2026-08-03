-- Service listing — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE listing LOGIN PASSWORD 'listing';
CREATE SCHEMA IF NOT EXISTS listing AUTHORIZATION listing;
ALTER ROLE listing SET search_path = listing;
GRANT ALL ON SCHEMA listing TO listing;
