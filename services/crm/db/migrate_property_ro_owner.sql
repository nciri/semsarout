-- Agence et propriétaire de l'annonce dans la projection locale : la prise de rendez-vous
-- publique doit savoir à qui rattacher la visite. Le consumer les tient ensuite à jour via
-- `listing.*` ; ce script ajoute les colonnes aux bases existantes. Idempotent.
ALTER TABLE crm.property_ro ADD COLUMN IF NOT EXISTS agency_id INTEGER;
ALTER TABLE crm.property_ro ADD COLUMN IF NOT EXISTS owner_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_property_ro_agency_id ON crm.property_ro (agency_id);

DO $$
BEGIN
  IF to_regclass('listing.property') IS NOT NULL THEN
    UPDATE crm.property_ro r SET agency_id = p.agency_id, owner_id = p.owner_id
    FROM listing.property p WHERE p.id = r.id AND r.agency_id IS NULL;
  END IF;
END $$;
