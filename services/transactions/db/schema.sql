-- Service transactions — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE transactions LOGIN PASSWORD 'transactions';
CREATE SCHEMA IF NOT EXISTS transactions AUTHORIZATION transactions;
ALTER ROLE transactions SET search_path = transactions;
GRANT ALL ON SCHEMA transactions TO transactions;
