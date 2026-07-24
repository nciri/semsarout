-- Service notification — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
-- Mot de passe d'exemple local — utiliser un secret en réel.

CREATE ROLE notification LOGIN PASSWORD 'notification';
CREATE SCHEMA IF NOT EXISTS notification AUTHORIZATION notification;
ALTER ROLE notification SET search_path = notification;
GRANT ALL ON SCHEMA notification TO notification;
