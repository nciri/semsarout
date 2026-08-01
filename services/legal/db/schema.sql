-- Service legal — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
-- Mot de passe d'exemple local — utiliser un secret en réel.

CREATE ROLE legal LOGIN PASSWORD 'legal';
CREATE SCHEMA IF NOT EXISTS legal AUTHORIZATION legal;
ALTER ROLE legal SET search_path = legal;
GRANT ALL ON SCHEMA legal TO legal;
