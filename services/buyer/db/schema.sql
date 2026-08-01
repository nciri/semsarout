-- Service buyer — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE buyer LOGIN PASSWORD 'buyer';
CREATE SCHEMA IF NOT EXISTS buyer AUTHORIZATION buyer;
ALTER ROLE buyer SET search_path = buyer;
GRANT ALL ON SCHEMA buyer TO buyer;
