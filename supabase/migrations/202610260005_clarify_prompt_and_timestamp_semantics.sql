-- Migration: 202610260005_clarify_prompt_and_timestamp_semantics.sql
-- Description: Clarify prompt and timestamp telemetry semantics:
-- 1. Add prompt_hash to separate logical prompt_id, explicit prompt_version (e.g. v1, v2), and content SHA-256 hash.
-- 2. Alter TIMESTAMPTZ default from timezone('utc', now()) to now() to prevent timezone shifting.
-- 3. Safely backfill existing prompt_version values without inventing explicit versions.

-- 1. Add dedicated prompt_hash column for content SHA-256 digest
ALTER TABLE ai_usage_analytics
    ADD COLUMN IF NOT EXISTS prompt_hash VARCHAR(64);

-- 2. Create index on prompt_hash
CREATE INDEX IF NOT EXISTS idx_ai_usage_prompt_hash ON ai_usage_analytics (prompt_hash);

-- 3. Alter TIMESTAMPTZ column defaults to canonical now()
ALTER TABLE ai_usage_analytics
    ALTER COLUMN timestamp SET DEFAULT now(),
    ALTER COLUMN created_at SET DEFAULT now();

-- 4. Safely backfill historical rows:
-- Case A: Composite format <id>:<version>:<hash> (e.g. expense_agent_assistant:v1:<64-hex>)
UPDATE ai_usage_analytics
SET
    prompt_id = COALESCE(prompt_id, split_part(prompt_version, ':', 1)),
    prompt_version = split_part(prompt_version, ':', 2),
    prompt_hash = split_part(prompt_version, ':', 3)
WHERE prompt_version ~ '^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-f0-9]{64}$';

-- Case B: Composite format <version>:<hash> (e.g. receipt-v3:<64-hex>)
UPDATE ai_usage_analytics
SET
    prompt_hash = split_part(prompt_version, ':', 2),
    prompt_version = split_part(prompt_version, ':', 1)
WHERE prompt_version ~ '^[a-zA-Z0-9_-]+:[a-f0-9]{64}$';

-- Case C: Pure 64-character SHA-256 hex digest mistakenly stored in prompt_version
-- Extract hash to prompt_hash, and set prompt_version to NULL (do NOT invent an explicit version)
UPDATE ai_usage_analytics
SET
    prompt_hash = prompt_version,
    prompt_version = NULL
WHERE prompt_version ~ '^[a-f0-9]{64}$';
