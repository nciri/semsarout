-- Parties d'un contrat : plusieurs vendeurs, plusieurs locataires (couple, colocataires,
-- héritiers d'une indivision) — le cas normal au Maroc. `create_all` n'émet jamais d'ALTER
-- ni de CREATE TABLE sur une base existante : d'où ce script, rejouable tel quel.
--
-- `client_id` est un entier nu : pas de clé étrangère entre services. Pas de colonne
-- `agency_id` : l'isolation passe par le contrat parent, déjà filtré sur l'agence.
-- `contract.client_id` reste la première partie, dérivée par le service.
--
-- Pas d'amorçage des contrats existants : leur rôle juridique ne se déduit pas de leur
-- `document_type` sans l'inventer. Un contrat déjà en base garde donc ses parties vides, et
-- ses blocs d'identification restent à compléter dans l'éditeur : la fusion ne prête PLUS le
-- `client_id` unique à tous les rôles — nommer la même personne bailleur et locataire dans un
-- acte signé est pire qu'un blanc, qui se lit comme un champ à remplir. Côté création, un
-- modèle à `{{parties_*}}` refuse désormais de générer sans au moins une partie.
CREATE TABLE IF NOT EXISTS contract.contract_party (
    id BIGSERIAL PRIMARY KEY,
    contract_id BIGINT NOT NULL,
    client_id INTEGER NOT NULL,
    role VARCHAR(20) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_contract_party_contract_id
    ON contract.contract_party(contract_id);
