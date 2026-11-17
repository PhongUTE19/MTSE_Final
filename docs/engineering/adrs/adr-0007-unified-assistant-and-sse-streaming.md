# ADR-0007: Unified Assistant Orchestrator, Server-Authoritative History & SSE Streaming

- **Status:** Accepted
- **Decision Classification:** Confirmed architectural decision (implemented in Phase 2 `P2-T12`–`P2-T13` and hardened in Phase 3 `P3-T02`–`P3-T06`)

## Context
SpendWise previously had two separate AI execution paths (`/api/expense-assistant` for single-tool finance calls without RAG, and `/api/chat-assistant` with isolated `'agent'` or `'rag'` modes), trusted client-supplied `history` arrays, and lacked real SSE streaming persistence.

## Decision
1. Consolidate AI orchestration into `server/src/features/chatAssistant/assistantOrchestrator.js` with `CHAT_STRATEGY` defaulting to `'unified'`, exposing both finance tools (`search_transactions`, `get_spending_summary`, draft-only `propose_transaction`) and `search_knowledge_base` in a bounded multi-step loop.
2. Wrap retrieved Knowledge Base chunks as untrusted reference material (`trust: 'untrusted'`) and validate `[S#]` citations against request-scoped retrieved sources before delivery/persistence.
3. Load conversation history server-authoritatively from `public.chat_conversations` and `public.chat_messages` (`202611170010`), using `begin_chat_stream_turn` (`202611170012` / `202611170013`) for idempotent `(user_id, request_id)` SSE turn registration and `AbortController` cancellation.

## Consequences
- **Positive:** Hybrid finance + documentation queries work in one turn; forged client assistant turns cannot poison model context; SSE disconnects abort upstream provider calls cleanly.
- **Trade-offs:** Legacy `/api/expense-assistant` routes remain mounted as thin facades for backward compatibility; `202611170010`–`202611170013` require remote Supabase deployment before production cutover.

## Implementation References
- `server/src/features/chatAssistant/assistantOrchestrator.js`, `chatAssistant.service.js`, `chatAssistant.controller.js`
- `supabase/migrations/202611170010_chat_history.sql`, `202611170012_chat_streaming_lifecycle.sql`, `202611170013_chat_stream_concurrency_hardening.sql`
