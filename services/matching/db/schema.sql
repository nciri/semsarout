-- Matching service schema (m3a-l3achrane)

CREATE ROLE matching WITH LOGIN PASSWORD 'matching';
CREATE SCHEMA matching AUTHORIZATION matching;

-- Pondérations versionnées
CREATE TABLE matching.matching_weights (
    id VARCHAR(32) PRIMARY KEY,
    version VARCHAR(40) NOT NULL UNIQUE,
    weights JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Projections des critères chercheur (alimentées par coloc.profile_updated)
CREATE TABLE matching.compatibility_profiles (
    id VARCHAR(32) PRIMARY KEY,
    seeker_id BIGINT NOT NULL UNIQUE,
    gender VARCHAR(10) NOT NULL,
    budget_min NUMERIC(12, 2),
    budget_max NUMERIC(12, 2) NOT NULL,
    city VARCHAR(80) NOT NULL,
    lifestyle JSONB NOT NULL DEFAULT '{}',
    importance JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_compatibility_profiles_seeker_id ON matching.compatibility_profiles(seeker_id);
CREATE INDEX ix_compatibility_profiles_city ON matching.compatibility_profiles(city);

-- Projections des critères annonce (alimentées par coloc.listing_published)
CREATE TABLE matching.listing_criteria (
    id VARCHAR(32) PRIMARY KEY,
    listing_id VARCHAR(32) NOT NULL UNIQUE,
    housing_gender VARCHAR(20) NOT NULL,
    rent NUMERIC(12, 2) NOT NULL,
    city VARCHAR(80) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 1,
    house_rules JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_listing_criteria_listing_id ON matching.listing_criteria(listing_id);
CREATE INDEX ix_listing_criteria_city ON matching.listing_criteria(city);

-- Cache des scores (generate-once / render-many)
CREATE TABLE matching.match_scores (
    id VARCHAR(32) PRIMARY KEY,
    seeker_id BIGINT NOT NULL,
    listing_id VARCHAR(32) NOT NULL,
    score INTEGER NOT NULL,
    hard_pass BOOLEAN NOT NULL,
    explanations JSONB NOT NULL DEFAULT '{}',
    weights_version VARCHAR(40) NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(seeker_id, listing_id)
);

CREATE INDEX ix_match_scores_seeker_id ON matching.match_scores(seeker_id);
CREATE INDEX ix_match_scores_listing_id ON matching.match_scores(listing_id);

-- Idempotence des événements
CREATE TABLE matching.processed_message (
    message_id VARCHAR(64) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

GRANT CONNECT ON DATABASE semsar TO matching;
GRANT USAGE ON SCHEMA matching TO matching;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA matching TO matching;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA matching TO matching;
