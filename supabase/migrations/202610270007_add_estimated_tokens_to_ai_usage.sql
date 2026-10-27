-- Migration: 202610270007_add_estimated_tokens_to_ai_usage.sql
-- Description: Add separate nullable columns for estimated input, output, and total tokens in ai_usage_analytics

ALTER TABLE ai_usage_analytics
    ADD COLUMN IF NOT EXISTS estimated_input_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS estimated_output_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS estimated_total_tokens INTEGER;

-- Index for querying records with estimated tokens
CREATE INDEX IF NOT EXISTS idx_ai_usage_estimated_tokens
    ON ai_usage_analytics (estimated_total_tokens)
    WHERE estimated_total_tokens IS NOT NULL;
