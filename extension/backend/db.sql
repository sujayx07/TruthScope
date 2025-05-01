-- Example SQL schema for url_verdicts
CREATE TABLE url_verdicts (
    domain VARCHAR(255) PRIMARY KEY,
    verdict VARCHAR(10) NOT NULL CHECK (verdict IN ('real', 'fake')) -- Or TEXT
);


-- Example SQL schema for analysis_results
CREATE TABLE analysis_results (
    url TEXT PRIMARY KEY,
    result_json JSONB NOT NULL,
    reports_real INTEGER DEFAULT 0 NOT NULL,
    reports_fake INTEGER DEFAULT 0 NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Optional: Index on timestamp if you query by time often
-- CREATE INDEX idx_analysis_results_timestamp ON analysis_results (timestamp);
-- Schema for the users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,                     -- Auto-incrementing integer ID for internal use
    google_id VARCHAR(255) UNIQUE NOT NULL,    -- Google's unique user ID ('sub')
    email VARCHAR(255),                        -- User's email address (optional, can be NULL)
    tier VARCHAR(50) NOT NULL DEFAULT 'free', -- User's subscription tier (e.g., 'free', 'paid')
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL -- Timestamp when the user was created
);

-- Optional: Index on google_id for faster lookups
CREATE INDEX idx_users_google_id ON users (google_id);