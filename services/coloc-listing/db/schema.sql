-- Service coloc-listing — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE coloc_listing LOGIN PASSWORD 'coloc_listing';
CREATE SCHEMA IF NOT EXISTS coloc_listing AUTHORIZATION coloc_listing;
ALTER ROLE coloc_listing SET search_path = coloc_listing;
GRANT ALL ON SCHEMA coloc_listing TO coloc_listing;
