-- Service staymanager — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE staymanager LOGIN PASSWORD 'staymanager';
CREATE SCHEMA IF NOT EXISTS staymanager AUTHORIZATION staymanager;
ALTER ROLE staymanager SET search_path = staymanager;
GRANT ALL ON SCHEMA staymanager TO staymanager;
