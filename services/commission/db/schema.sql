-- Service commission — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE commission LOGIN PASSWORD 'commission';
CREATE SCHEMA IF NOT EXISTS commission AUTHORIZATION commission;
ALTER ROLE commission SET search_path = commission;
GRANT ALL ON SCHEMA commission TO commission;
