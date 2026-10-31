-- Modèles de contrats déposés en fichier (Word ou PDF) à côté des modèles HTML.
-- `create_all` crée les tables manquantes mais n'émet jamais d'ALTER : sans ce script, les
-- trois colonnes mappées par l'ORM manquent en production et chaque SELECT du modèle lève
-- `UndefinedColumn` — le service contract tombe en entier, pas seulement le dépôt.
--
-- `body_html` perd son NOT NULL : un modèle fichier n'a pas de corps fusionnable, et la
-- génération de contrat refuse explicitement ces modèles (cf. app/main.py).
ALTER TABLE contract.contract_template ADD COLUMN IF NOT EXISTS file_key VARCHAR(255);
ALTER TABLE contract.contract_template ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE contract.contract_template ADD COLUMN IF NOT EXISTS file_mime VARCHAR(120);
ALTER TABLE contract.contract_template ALTER COLUMN body_html DROP NOT NULL;
