-- Table outbox du monolithe (émission d'événements v2, Phase 1).
-- Additif et rétro-compatible. À appliquer AVANT d'activer SEMSAR_OUTBOX_ENABLED.
-- (Une migration Alembic équivalente peut être générée via `flask db migrate`.)

CREATE TABLE IF NOT EXISTS outbox (
    id             BIGSERIAL PRIMARY KEY,
    aggregate_type VARCHAR(80)  NOT NULL,
    aggregate_id   VARCHAR(80)  NOT NULL,
    event_type     VARCHAR(120) NOT NULL,
    payload        JSONB        NOT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT now(),
    published_at   TIMESTAMP    NULL
);

CREATE INDEX IF NOT EXISTS ix_outbox_unpublished ON outbox (published_at);
