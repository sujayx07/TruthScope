-- Example SQL schema for url_verdicts
CREATE TABLE url_verdicts (
    domain VARCHAR(255) PRIMARY KEY,
    verdict VARCHAR(10) NOT NULL CHECK (verdict IN ('real', 'fake')) -- Or TEXT
);


-- Example SQL schema for analysis_results
CREATE TABLE analysis_results (
    url TEXT PRIMARY KEY,
    result_json JSONB NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Optional: Index on timestamp if you query by time often
-- CREATE INDEX idx_analysis_results_timestamp ON analysis_results (timestamp);