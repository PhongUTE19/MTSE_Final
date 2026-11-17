# ADR-0009: Decoupled Docker Runtime Configuration & Graceful Shutdown Lifecycle

- **Status:** Accepted
- **Decision Classification:** Explicitly approved implementation decision (implemented in Phase 4 `P4-T03`–`P4-T04-R1`)

## Context
`client/Dockerfile` previously failed without a developer-local `client/.env`, `docker-compose.yml` lacked healthchecks, `/api/health` returned HTTP 500 when optional Qdrant was unavailable, and Express lacked coordinated `SIGTERM`/`SIGINT` shutdown and frontend SSE HTTP 401 handling.

## Decision
1. Decouple `client/Dockerfile` from `.env` by serving `/runtime-config.js` generated at Nginx startup (`client/docker-entrypoint.d/40-runtime-config.sh`) using BusyBox-compatible `awk` JSON escaping and atomic `mv -f`, resolved via `resolvePublicSupabaseConfig()` in `client/src/shared/services/supabaseAuth.js`.
2. Add `GET /api/health/live` (`createLiveHealthHandler`) independent of optional Qdrant so `docker-compose.yml` can enforce `condition: service_healthy` on `client -> server` without turning Qdrant into a mandatory startup dependency.
3. Implement `createShutdownManager()` (`server/src/shared/lifecycle.js`) for idempotent `SIGTERM`/`SIGINT` handling, bounded SSE/request draining, and startup configuration diagnostics (`inspectStartupConfig`), and share `authenticatedFetch()`/`handleUnauthorized()` across REST and SSE (`sendChatMessageStream`).

## Consequences
- **Positive:** Client Docker images are environment-agnostic; optional Qdrant outages do not block container startup; SSE streams share HTTP 401 session-expiration handling and drain cleanly on shutdown.
- **Trade-offs:** Public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be supplied to the `client` container environment at runtime.

## Implementation References
- `client/Dockerfile`, `client/docker-entrypoint.d/40-runtime-config.sh`, `client/src/shared/services/supabaseAuth.js`
- `docker-compose.yml`, `server/src/shared/lifecycle.js`, `server/src/shared/middleware/appSecurity.js`
- `client/src/shared/services/apiClient.js`, `client/src/features/chat/chatApi.js`
