-- Messagerie bidirectionnelle : nouvelles tables (les données legacy sont migrées par script Python).
CREATE TABLE IF NOT EXISTS messaging.conversation (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL,
    owner_party INTEGER,
    requester_party INTEGER,
    context_type VARCHAR(30) NOT NULL,
    context_ref_id INTEGER,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_conversation_thread UNIQUE (property_id, requester_party, context_type)
);
CREATE INDEX IF NOT EXISTS ix_conversation_property ON messaging.conversation (property_id);
CREATE TABLE IF NOT EXISTS messaging.message (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES messaging.conversation(id),
    sender_party INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    read_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_message_conversation ON messaging.message (conversation_id);
