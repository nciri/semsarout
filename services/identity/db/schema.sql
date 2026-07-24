-- Service identity — rôle + schéma dédiés (PostgreSQL NATIF, cf. ADR-0002).
-- À exécuter par un rôle admin sur la base SemsarOut. Le mot de passe doit venir
-- d'un secret (jamais commité) — la valeur ci-dessous n'est qu'un exemple local.

CREATE ROLE identity LOGIN PASSWORD 'identity';
CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION identity;
ALTER ROLE identity SET search_path = identity;
GRANT ALL ON SCHEMA identity TO identity;

-- Extensions utiles (chiffrement du CIN au repos en cible)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
