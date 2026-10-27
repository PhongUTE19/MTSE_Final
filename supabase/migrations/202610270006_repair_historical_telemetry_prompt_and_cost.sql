-- Migration: 202610270006_repair_historical_telemetry_prompt_and_cost.sql
-- Description: Repair historical AI telemetry data, prompt identity, token counts, and cost data.

-- 1. Ensure prompt_hash column exists
ALTER TABLE ai_usage_analytics
    ADD COLUMN IF NOT EXISTS prompt_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_ai_usage_prompt_hash ON ai_usage_analytics (prompt_hash);

-- 2. Safely normalize prompt metadata:
-- Case A: Composite format <id>:<version>:<hash>
UPDATE ai_usage_analytics
SET
    prompt_id = COALESCE(prompt_id, split_part(prompt_version, ':', 1)),
    prompt_version = split_part(prompt_version, ':', 2),
    prompt_hash = COALESCE(prompt_hash, split_part(prompt_version, ':', 3))
WHERE prompt_version ~ '^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-f0-9]{64}$';

-- Case B: Composite format <version>:<hash>
UPDATE ai_usage_analytics
SET
    prompt_hash = COALESCE(prompt_hash, split_part(prompt_version, ':', 2)),
    prompt_version = split_part(prompt_version, ':', 1)
WHERE prompt_version ~ '^[a-zA-Z0-9_-]+:[a-f0-9]{64}$';

-- Case C: Pure 64-hex SHA-256 hash mistakenly stored in prompt_version
-- Move to prompt_hash and set prompt_version to NULL (do NOT invent an explicit version)
UPDATE ai_usage_analytics
SET
    prompt_hash = COALESCE(prompt_hash, prompt_version),
    prompt_version = NULL
WHERE prompt_version ~ '^[a-f0-9]{64}$';

-- 3. Safely derive total_tokens ONLY when total_tokens is missing but both input and output exist
UPDATE ai_usage_analytics
SET
    total_tokens = input_tokens + output_tokens,
    token_counts_available = true
WHERE total_tokens IS NULL
  AND input_tokens IS NOT NULL
  AND output_tokens IS NOT NULL;

-- 4. Normalize cost_status for requests with missing tokens
-- Keep estimated_cost as NULL (never fabricate 0)
UPDATE ai_usage_analytics
SET cost_status = 'missing_tokens'
WHERE estimated_cost IS NULL
  AND (input_tokens IS NULL OR output_tokens IS NULL)
  AND (cost_status IS NULL OR cost_status = 'unknown');

-- 5. Recalculate historical cost for requests with verified pricing and actual tokens
-- Model: gemini-3.5-flash-lite (effective 2026-01-01, input: $0.075/1M, output: $0.30/1M)
UPDATE ai_usage_analytics
SET
    estimated_cost = ROUND(
        ((input_tokens::numeric / 1000000.0) * 0.075) +
        ((output_tokens::numeric / 1000000.0) * 0.30),
        8
    ),
    cost_status = 'calculated'
WHERE estimated_cost IS NULL
  AND input_tokens IS NOT NULL
  AND output_tokens IS NOT NULL
  AND (model = 'gemini-3.5-flash-lite' OR model = 'models/gemini-3.5-flash-lite')
  AND timestamp >= '2026-01-01T00:00:00Z';

-- Model: gemini-2.5-flash (effective 2026-01-01, input: $0.075/1M, output: $0.30/1M)
UPDATE ai_usage_analytics
SET
    estimated_cost = ROUND(
        ((input_tokens::numeric / 1000000.0) * 0.075) +
        ((output_tokens::numeric / 1000000.0) * 0.30),
        8
    ),
    cost_status = 'calculated'
WHERE estimated_cost IS NULL
  AND input_tokens IS NOT NULL
  AND output_tokens IS NOT NULL
  AND (model = 'gemini-2.5-flash' OR model = 'models/gemini-2.5-flash')
  AND timestamp >= '2026-01-01T00:00:00Z';

-- Model: gemini-1.5-flash (effective 2026-01-01, input: $0.075/1M, output: $0.30/1M)
UPDATE ai_usage_analytics
SET
    estimated_cost = ROUND(
        ((input_tokens::numeric / 1000000.0) * 0.075) +
        ((output_tokens::numeric / 1000000.0) * 0.30),
        8
    ),
    cost_status = 'calculated'
WHERE estimated_cost IS NULL
  AND input_tokens IS NOT NULL
  AND output_tokens IS NOT NULL
  AND (model = 'gemini-1.5-flash' OR model = 'models/gemini-1.5-flash')
  AND timestamp >= '2026-01-01T00:00:00Z';

-- Ensure already calculated costs have cost_status = 'calculated'
UPDATE ai_usage_analytics
SET cost_status = 'calculated'
WHERE estimated_cost IS NOT NULL
  AND (cost_status IS NULL OR cost_status = 'unknown' OR cost_status = 'estimated');
