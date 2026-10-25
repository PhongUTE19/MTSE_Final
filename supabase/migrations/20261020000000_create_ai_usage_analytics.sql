-- Migration: 20261020000000_create_ai_usage_analytics.sql
-- Description: Create dedicated persistent storage for AI usage tracking records

CREATE TABLE IF NOT EXISTS ai_usage_analytics (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    feature VARCHAR(64) NOT NULL,
    operation VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL DEFAULT 'google-genai',
    model VARCHAR(128) NOT NULL,
    outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('success', 'failure', 'refusal')),
    is_refusal BOOLEAN NOT NULL DEFAULT false,
    refusal_reason VARCHAR(128),
    duration_ms INTEGER NOT NULL DEFAULT 0,
    time_to_first_token_ms INTEGER,
    total_attempts INTEGER NOT NULL DEFAULT 1,
    attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    token_counts_available BOOLEAN NOT NULL DEFAULT false,
    prompt_version VARCHAR(64),
    tools_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
    error JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for time-range filtering, feature breakdowns, model performance, and outcome monitoring
CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON ai_usage_analytics (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_analytics (feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_analytics (model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_outcome ON ai_usage_analytics (outcome);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature_outcome ON ai_usage_analytics (feature, outcome);
CREATE INDEX IF NOT EXISTS idx_ai_usage_prompt_version ON ai_usage_analytics (prompt_version);

-- Enable Row Level Security (RLS)
ALTER TABLE ai_usage_analytics ENABLE ROW LEVEL SECURITY;

-- Deny public/anon access by default; allow server service_role full access
-- Policy: Only service_role can read or write analytics records
DROP POLICY IF EXISTS "Service role full access on ai_usage_analytics" ON ai_usage_analytics;
CREATE POLICY "Service role full access on ai_usage_analytics"
    ON ai_usage_analytics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
