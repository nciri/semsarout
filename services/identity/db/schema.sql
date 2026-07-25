-- Service identity — rôle + schéma dédiés (PostgreSQL NATIF, cf. ADR-0002).
-- À exécuter par un rôle admin sur la base SemsarOut. Le mot de passe doit venir
-- d'un secret (jamais commité) — la valeur ci-dessous n'est qu'un exemple local.

CREATE ROLE identity LOGIN PASSWORD 'identity';
CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION identity;
ALTER ROLE identity SET search_path = identity;
GRANT ALL ON SCHEMA identity TO identity;

-- Extensions utiles (chiffrement du CIN au repos en cible)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Séquence des ids d'`audit.logged` émis par identity (attribution de rôles, CRUD des rôles).
-- Démarrée très haut : plage disjointe de `activity_logs.id` du monolithe, pour que
-- l'idempotence par id du service audit reste correcte (cf. app/audit.py). Idempotent —
-- créée aussi au démarrage par init_db(), gardée ici pour les installations neuves.
CREATE SEQUENCE IF NOT EXISTS identity.audit_log_seq START WITH 9000000000001;
ALTER SEQUENCE identity.audit_log_seq OWNER TO identity;
