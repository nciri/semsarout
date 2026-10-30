-- Parties d'un contrat : plusieurs vendeurs, plusieurs locataires (couple, colocataires,
-- héritiers d'une indivision) — le cas normal au Maroc. `create_all` n'émet jamais d'ALTER
-- ni de CREATE TABLE sur une base existante : d'où ce script, rejouable tel quel.
--
-- `client_id` est un entier nu : pas de clé étrangère entre services. Pas de colonne
-- `agency_id` : l'isolation passe par le contrat parent, déjà filtré sur l'agence.
-- `contract.client_id` reste la première partie, dérivée par le service.
--
-- Pas d'amorçage des contrats existants : leur rôle juridique ne se déduit pas de leur
-- `document_type` sans l'inventer. Sans partie, la fusion fait tenir tous les rôles au
-- `client_id` unique du contrat — exact pour un contrat à une partie.
CREATE TABLE IF NOT EXISTS contract.contract_party (
    id BIGSERIAL PRIMARY KEY,
    contract_id BIGINT NOT NULL,
    client_id INTEGER NOT NULL,
    role VARCHAR(20) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_contract_party_contract_id
    ON contract.contract_party(contract_id);
