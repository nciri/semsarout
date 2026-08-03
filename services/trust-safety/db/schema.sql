-- Service trust-safety — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE trust_safety LOGIN PASSWORD 'trust_safety';
CREATE SCHEMA IF NOT EXISTS trust_safety AUTHORIZATION trust_safety;
ALTER ROLE trust_safety SET search_path = trust_safety;
GRANT ALL ON SCHEMA trust_safety TO trust_safety;
