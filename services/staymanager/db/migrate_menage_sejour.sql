-- Ménage de rotation : une tâche par départ (unicité sur le séjour), rapports de l'agent et
-- photos (clés d'objet-store, le fichier reste dans MinIO/S3).
CREATE TABLE IF NOT EXISTS staymanager.cleaning_task (
  id              BIGSERIAL PRIMARY KEY,
  agency_id       INTEGER NOT NULL,
  property_id     INTEGER NOT NULL,
  reservation_id  BIGINT REFERENCES staymanager.staymanager_reservation (id),
  assigned_to_id  INTEGER,
  scheduled_date  DATE NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',
  zones_done      JSONB DEFAULT '[]'::jsonb,
  notes           TEXT,
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_cleaning_task_reservation UNIQUE (reservation_id)
);
CREATE INDEX IF NOT EXISTS ix_cleaning_task_agency ON staymanager.cleaning_task (agency_id);
CREATE INDEX IF NOT EXISTS ix_cleaning_task_property ON staymanager.cleaning_task (property_id);
CREATE INDEX IF NOT EXISTS ix_cleaning_task_date ON staymanager.cleaning_task (scheduled_date);
CREATE INDEX IF NOT EXISTS ix_cleaning_task_status ON staymanager.cleaning_task (status);

CREATE TABLE IF NOT EXISTS staymanager.cleaning_report (
  id              BIGSERIAL PRIMARY KEY,
  task_id         BIGINT NOT NULL REFERENCES staymanager.cleaning_task (id),
  author_user_id  INTEGER,
  kind            VARCHAR(20) NOT NULL,
  category        VARCHAR(40),
  text_note       TEXT,
  is_urgent       BOOLEAN DEFAULT FALSE,
  seen_at         TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_cleaning_report_task ON staymanager.cleaning_report (task_id);

CREATE TABLE IF NOT EXISTS staymanager.cleaning_photo (
  id            BIGSERIAL PRIMARY KEY,
  report_id     BIGINT NOT NULL REFERENCES staymanager.cleaning_report (id),
  file_key      VARCHAR(255) NOT NULL,
  content_type  VARCHAR(100),
  filename      VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_cleaning_photo_report ON staymanager.cleaning_photo (report_id);
