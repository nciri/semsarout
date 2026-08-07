-- Messagerie m3a-l3achrane : tenant sur `conversation` (défense en profondeur, dédupe par
-- tenant) + table `notification` (in-app, feed non-lues + compteur). `notification` est
-- créée automatiquement par `Base.metadata.create_all` (app.db.init_db) au démarrage du
-- service ; ce script ne couvre que l'ALTER de la table existante `conversation`.
ALTER TABLE messaging.conversation
    ADD COLUMN IF NOT EXISTS tenant VARCHAR(30) NOT NULL DEFAULT 'm3a-l3achrane';

ALTER TABLE messaging.conversation
    DROP CONSTRAINT IF EXISTS uq_conversation_thread;
ALTER TABLE messaging.conversation
    ADD CONSTRAINT uq_conversation_thread UNIQUE (tenant, property_id, requester_party, context_type);

CREATE INDEX IF NOT EXISTS ix_conversation_tenant ON messaging.conversation (tenant);
