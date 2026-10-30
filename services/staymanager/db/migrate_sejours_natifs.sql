-- Séjours courte durée natifs : calendriers iCal des plateformes et réservations qui en
-- viennent. Une seule table de réservations sert le miroir StayManager et les séjours
-- natifs : les colonnes du miroir deviennent donc facultatives.
CREATE TABLE IF NOT EXISTS staymanager.ical_source (
  id                  BIGSERIAL PRIMARY KEY,
  agency_id           INTEGER NOT NULL,
  property_id         INTEGER NOT NULL,
  platform            VARCHAR(30) NOT NULL,
  ical_url            VARCHAR(1000) NOT NULL,
  status              VARCHAR(20) DEFAULT 'pending',
  last_error          VARCHAR(255),
  last_synced_at      TIMESTAMP,
  reservations_count  INTEGER DEFAULT 0,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_ical_source_agency ON staymanager.ical_source (agency_id);
CREATE INDEX IF NOT EXISTS ix_ical_source_property ON staymanager.ical_source (property_id);

ALTER TABLE staymanager.staymanager_reservation
  ALTER COLUMN property_link_id DROP NOT NULL;
ALTER TABLE staymanager.staymanager_reservation
  ALTER COLUMN staymanager_reservation_id DROP NOT NULL;
ALTER TABLE staymanager.staymanager_reservation ADD COLUMN IF NOT EXISTS agency_id INTEGER;
ALTER TABLE staymanager.staymanager_reservation ADD COLUMN IF NOT EXISTS property_id INTEGER;
ALTER TABLE staymanager.staymanager_reservation ADD COLUMN IF NOT EXISTS ical_source_id BIGINT;
ALTER TABLE staymanager.staymanager_reservation ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'staymanager';
ALTER TABLE staymanager.staymanager_reservation ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN DEFAULT FALSE;
ALTER TABLE staymanager.staymanager_reservation ADD COLUMN IF NOT EXISTS cleaning_fee NUMERIC(12,2);
CREATE INDEX IF NOT EXISTS ix_reservation_agency ON staymanager.staymanager_reservation (agency_id);
CREATE INDEX IF NOT EXISTS ix_reservation_property ON staymanager.staymanager_reservation (property_id);
CREATE INDEX IF NOT EXISTS ix_reservation_ical_source ON staymanager.staymanager_reservation (ical_source_id);
