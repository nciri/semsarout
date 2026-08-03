-- Service coloc-profile — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE coloc_profile LOGIN PASSWORD 'coloc_profile';
CREATE SCHEMA IF NOT EXISTS coloc_profile AUTHORIZATION coloc_profile;
ALTER ROLE coloc_profile SET search_path = coloc_profile;
GRANT ALL ON SCHEMA coloc_profile TO coloc_profile;
