-- Statut catalogue du bien dans la projection locale (constat « bien marqué vendu/loué » du
-- Pipeline). Le consumer le tient à jour via `listing.*` ; ce script ajoute la colonne aux bases
-- existantes et l'amorce depuis le catalogue. Idempotent.
ALTER TABLE transactions.property_ro ADD COLUMN IF NOT EXISTS status VARCHAR(20);

DO $$
BEGIN
  IF to_regclass('listing.property') IS NOT NULL THEN
    UPDATE transactions.property_ro r SET status = p.status
    FROM listing.property p
    WHERE p.id = r.id AND r.status IS NULL;
  END IF;
END $$;
