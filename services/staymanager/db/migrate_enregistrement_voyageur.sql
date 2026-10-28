-- Enregistrement du voyageur : lien privé (jeton haché), occupants déclarés, pièces.
CREATE TABLE IF NOT EXISTS staymanager.stay_checkin_link (
  id              BIGSERIAL PRIMARY KEY,
  agency_id       INTEGER NOT NULL,
  reservation_id  BIGINT NOT NULL REFERENCES staymanager.staymanager_reservation (id),
  token_hash      VARCHAR(64) NOT NULL UNIQUE,
  status          VARCHAR(20) DEFAULT 'sent',
  expires_at      TIMESTAMP NOT NULL,
  submitted_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_checkin_link_reservation UNIQUE (reservation_id)
);
CREATE INDEX IF NOT EXISTS ix_checkin_link_agency ON staymanager.stay_checkin_link (agency_id);
CREATE INDEX IF NOT EXISTS ix_checkin_link_token ON staymanager.stay_checkin_link (token_hash);

CREATE TABLE IF NOT EXISTS staymanager.stay_guest (
  id               BIGSERIAL PRIMARY KEY,
  reservation_id   BIGINT NOT NULL REFERENCES staymanager.staymanager_reservation (id),
  full_name        VARCHAR(200) NOT NULL,
  is_lead          BOOLEAN DEFAULT FALSE,
  birth_date       DATE,
  nationality      VARCHAR(60),
  document_type    VARCHAR(20),
  document_number  VARCHAR(60),
  status           VARCHAR(20) DEFAULT 'declared',
  review_note      VARCHAR(255),
  created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_stay_guest_reservation ON staymanager.stay_guest (reservation_id);

CREATE TABLE IF NOT EXISTS staymanager.stay_guest_document (
  id            BIGSERIAL PRIMARY KEY,
  guest_id      BIGINT NOT NULL REFERENCES staymanager.stay_guest (id),
  file_key      VARCHAR(255) NOT NULL,
  content_type  VARCHAR(100),
  filename      VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_stay_guest_doc_guest ON staymanager.stay_guest_document (guest_id);
