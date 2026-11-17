# ADR-0008: Git-Managed Prompts, Qdrant Active Alias & Usage Provenance

- **Status:** Accepted
- **Decision Classification:** Confirmed architectural decision (implemented in Phase 2 `P2-T14` and verified in Phase 3)

## Context
Runtime prompt mutation via admin APIs creates unreviewed prompt-drift risk, destructive Qdrant collection recreation causes search downtime during reindexing, and estimated token counts were previously indistinguishable from provider-reported usage in `ai_usage_analytics`.

## Decision
1. Keep canonical system prompts (`server/prompts/`) and Knowledge Base documents (`data/knowledge/`) Git-managed and strictly read-only at runtime (`GET /api/admin/system-prompt`, `GET /api/admin/document`).
2. Treat Qdrant as a derived index behind the `spendwise_active` alias; reindexing builds and verifies a timestamped shadow collection (`spendwise_shadow_*`) before switching the active alias.
3. Record explicit `usage_source` provenance (`'provider_reported'`, `'derived'`, `'unavailable'`, `'unknown'`) in `public.ai_usage_analytics` (`202611170014`).

## Consequences
- **Positive:** Prompt and Knowledge Base changes are version-controlled; reindex failures leave `spendwise_active` intact; usage analytics distinguish measured vs. derived tokens.
- **Trade-offs:** Updating prompts or Knowledge Base content requires a repository change and reindex trigger rather than in-app editing. Reindex concurrency locking is in-process; distributed locking for multi-process deployments remains a separate concern.

## Implementation References
- `server/prompts/`, `data/knowledge/`, `server/src/features/knowledgeBase/qdrantAdapter.js`
- `server/src/features/systemPrompt/systemPrompt.route.js`, `server/src/features/document/document.route.js`
- `supabase/migrations/202611170014_add_usage_source_to_ai_usage.sql`
