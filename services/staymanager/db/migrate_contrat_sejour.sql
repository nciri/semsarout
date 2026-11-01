-- Contrat de séjour : la réservation garde la référence du contrat tenu par `contract`.
ALTER TABLE staymanager.staymanager_reservation ADD COLUMN IF NOT EXISTS contract_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_staymanager_reservation_contract
    ON staymanager.staymanager_reservation(contract_id);
