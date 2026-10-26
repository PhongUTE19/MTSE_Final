-- Migration: 202610260004_add_cost_and_prompt_id_to_ai_usage.sql
-- Description: Add prompt_id, estimated_cost, cost_status, and widen prompt_version in ai_usage_analytics

ALTER TABLE ai_usage_analytics
    ADD COLUMN IF NOT EXISTS prompt_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12, 8),
    ADD COLUMN IF NOT EXISTS cost_status VARCHAR(32) DEFAULT 'unknown';

-- Widen prompt_version to support composite structured version identifiers
ALTER TABLE ai_usage_analytics
    ALTER COLUMN prompt_version TYPE VARCHAR(128);

-- Add indexes for efficient prompt tracking and cost filtering
CREATE INDEX IF NOT EXISTS idx_ai_usage_prompt_id ON ai_usage_analytics (prompt_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_estimated_cost ON ai_usage_analytics (estimated_cost);
