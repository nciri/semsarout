-- Codes d'entrée : mode d'accès par bien (clé remise, code manuel, serrure TTLock) et code
-- posé pour chaque séjour. Les identifiants TTLock restent dans property_access.credentials
-- et ne sortent jamais par une API.
CREATE TABLE IF NOT EXISTS staymanager.property_access (
  id            BIGSERIAL PRIMARY KEY,
  agency_id     INTEGER NOT NULL,
  property_id   INTEGER NOT NULL,
  mode          VARCHAR(20) DEFAULT 'traditional',
  instructions  TEXT,
  credentials   JSONB,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_property_access_property UNIQUE (property_id)
);
CREATE INDEX IF NOT EXISTS ix_property_access_agency ON staymanager.property_access (agency_id);

CREATE TABLE IF NOT EXISTS staymanager.stay_access_code (
  id              BIGSERIAL PRIMARY KEY,
  agency_id       INTEGER NOT NULL,
  reservation_id  BIGINT NOT NULL REFERENCES staymanager.staymanager_reservation (id),
  mode            VARCHAR(20) NOT NULL,
  code            VARCHAR(20) NOT NULL,
  external_id     VARCHAR(60),
  valid_from      TIMESTAMP,
  valid_until     TIMESTAMP,
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMP DEFAULT NOW(),
  revoked_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_stay_code_agency ON staymanager.stay_access_code (agency_id);
CREATE INDEX IF NOT EXISTS ix_stay_code_reservation ON staymanager.stay_access_code (reservation_id);
CREATE INDEX IF NOT EXISTS ix_stay_code_status ON staymanager.stay_access_code (status);
