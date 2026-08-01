-- Service marketplace — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE marketplace LOGIN PASSWORD 'marketplace';
CREATE SCHEMA IF NOT EXISTS marketplace AUTHORIZATION marketplace;
ALTER ROLE marketplace SET search_path = marketplace;
GRANT ALL ON SCHEMA marketplace TO marketplace;
