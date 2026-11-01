-- Messagerie de séjour : modèles de l'agence et messages préparés pour chaque séjour.
-- L'envoi reste au service notification ; `stay_message` est aussi le registre
-- d'idempotence de son ordonnanceur, d'où l'unicité (modèle, séjour).
CREATE TABLE IF NOT EXISTS staymanager.stay_message_template (
  id            BIGSERIAL PRIMARY KEY,
  agency_id     INTEGER NOT NULL,
  property_id   INTEGER,
  name          VARCHAR(120) NOT NULL,
  trigger_event VARCHAR(30) NOT NULL,
  offset_hours  INTEGER DEFAULT 0,
  subject       VARCHAR(200) NOT NULL,
  body          TEXT NOT NULL,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_stay_tpl_agency ON staymanager.stay_message_template (agency_id);
CREATE INDEX IF NOT EXISTS ix_stay_tpl_property ON staymanager.stay_message_template (property_id);

CREATE TABLE IF NOT EXISTS staymanager.stay_message (
  id              BIGSERIAL PRIMARY KEY,
  agency_id       INTEGER NOT NULL,
  template_id     BIGINT NOT NULL REFERENCES staymanager.stay_message_template (id),
  reservation_id  BIGINT NOT NULL REFERENCES staymanager.staymanager_reservation (id),
  recipient       VARCHAR(255),
  subject         VARCHAR(200),
  body            TEXT,
  status          VARCHAR(20) DEFAULT 'pending',
  error           VARCHAR(255),
  due_at          TIMESTAMP,
  sent_at         TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_stay_message UNIQUE (template_id, reservation_id)
);
CREATE INDEX IF NOT EXISTS ix_stay_message_agency ON staymanager.stay_message (agency_id);
CREATE INDEX IF NOT EXISTS ix_stay_message_status ON staymanager.stay_message (status);
CREATE INDEX IF NOT EXISTS ix_stay_message_due ON staymanager.stay_message (due_at);
