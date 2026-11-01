-- Équipes métier : type d'équipe, couleur, description, et appartenances secondaires.
-- `create_all` ne fait jamais d'ALTER : ces colonnes doivent être posées ici.
ALTER TABLE identity.team ADD COLUMN IF NOT EXISTS kind VARCHAR(30) NOT NULL DEFAULT 'generale';
ALTER TABLE identity.team ADD COLUMN IF NOT EXISTS color VARCHAR(16);
ALTER TABLE identity.team ADD COLUMN IF NOT EXISTS description VARCHAR(255);

CREATE TABLE IF NOT EXISTS identity.team_membership (
    id          SERIAL PRIMARY KEY,
    agency_id   INTEGER NOT NULL,
    team_id     INTEGER NOT NULL REFERENCES identity.team(id) ON DELETE CASCADE,
    user_id     BIGINT  NOT NULL,
    job         VARCHAR(40) NOT NULL DEFAULT 'membre',
    created_at  TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_team_membership UNIQUE (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_team_membership_agency ON identity.team_membership(agency_id);
CREATE INDEX IF NOT EXISTS ix_team_membership_user ON identity.team_membership(user_id);
