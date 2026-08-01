-- Service payment — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
-- Mot de passe d'exemple local — utiliser un secret en réel.

CREATE ROLE payment LOGIN PASSWORD 'payment';
CREATE SCHEMA IF NOT EXISTS payment AUTHORIZATION payment;
ALTER ROLE payment SET search_path = payment;
GRANT ALL ON SCHEMA payment TO payment;
