-- Projection texte des notes d'un dossier, qui sont désormais saisies en WYSIWYG.
--
-- Pourquoi une colonne et pas une projection à la volée : `GET /backoffice/transactions?q=`
-- filtre en SQL `ILIKE`, et le `count()` comme la pagination sont faits en base. Sur du HTML,
-- une recherche sur « p » ou « li » remonterait toutes les transactions annotées, et une
-- recherche sur « bon de visite » ne trouverait plus « bon de <b>visite</b> ».
--
-- `create_all` couvre les bases neuves ; ce script ajoute la colonne aux bases existantes.
-- Idempotent : ne remplit que les lignes encore vides.
ALTER TABLE transactions.transaction ADD COLUMN IF NOT EXISTS notes_text TEXT;

-- Rétro-remplissage. Les notes écrites **avant** la bascule WYSIWYG sont du texte brut :
-- elles n'ont aucune balise et se recopient telles quelles. Le `regexp_replace` ne sert
-- donc qu'aux lignes déjà réécrites par un agent depuis la bascule, et reste volontairement
-- grossier : la colonne n'est qu'un index de recherche, et le service la réécrit
-- proprement (`semsar_common.html_to_text`) à la prochaine modification du dossier.
UPDATE transactions.transaction
SET notes_text = nullif(btrim(regexp_replace(
      regexp_replace(notes, '<[^>]*>', ' ', 'g'),  -- balises → espace, pour ne pas coller deux mots
      '\s+', ' ', 'g')), '')
WHERE notes IS NOT NULL AND notes_text IS NULL;
