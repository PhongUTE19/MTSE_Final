# SpendWise Deployment & Supabase Migration Checklist

## 1. Pre-Deployment Backup & Readiness Checks

- Take a verified PostgreSQL backup / snapshot in the target Supabase project before applying schema changes.
- Verify target project ref and confirm `server/.env` contains valid server-only credentials (`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`) and deployment-specific settings (`CORS_ORIGIN`, `TRUST_PROXY`).
- Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public client values only; never `SUPABASE_SECRET_KEY`) are supplied to the `client` container runtime environment.

## 2. Required Supabase Migrations (Ordered)

Ensure all baseline migrations (`20261020000000` through `202611160008`) are already applied, then apply the following migrations strictly in timestamp order through the approved Supabase migration pipeline (`supabase db push` or authorized SQL execution after live audit):

1. `202611170009_confirm_staged_receipt_transaction.sql` — Atomic RPC `confirm_staged_receipt_transaction` for staged receipt confirmation.
2. `202611170010_chat_history.sql` — `public.chat_conversations` and `public.chat_messages` tables with RLS policies.
3. `202611170011_retire_legacy_drafts_and_extractions.sql` — Forward-only retirement of legacy `public.transaction_drafts` and `public.receipt_extractions`.
4. `202611170012_chat_streaming_lifecycle.sql` — Streaming lifecycle columns, idempotency index (`request_id`), and `begin_chat_stream_turn` RPC.
5. `202611170013_chat_stream_concurrency_hardening.sql` — Concurrency-hardened `begin_chat_stream_turn` RPC.
6. `202611170014_add_usage_source_to_ai_usage.sql` — Adds `usage_source` provenance column to `public.ai_usage_analytics`.

> [!WARNING]
> Migrations `202611170009` through `202611170014` are marked `LOCAL ONLY` in-repo until an authorized operator verifies and applies them against the target remote database. Never assume local files reflect remote state without checking `supabase_migrations.schema_migrations`.

## 3. Post-Migration Verification

- Confirm all 6 migration versions appear in `supabase_migrations.schema_migrations`.
- Verify RLS is enabled on `public.chat_conversations` and `public.chat_messages`, `confirm_staged_receipt_transaction` and `begin_chat_stream_turn` exist, and `public.ai_usage_analytics.usage_source` accepts `'provider_reported'`, `'derived'`, `'unavailable'`, and `'unknown'`.

## 4. Application Deployment Sequencing & Rollback Guidance

1. Apply database migrations **before** rolling out the new `server` and `client` containers.
2. Validate Compose config: `docker compose --env-file server/.env config --quiet`.
3. Build and start services: `docker compose --env-file server/.env up -d --build`.
4. Verify `server` becomes `healthy` (`GET /api/health/live`) and `client` (`depends_on: server: condition: service_healthy`) becomes `healthy`.
5. **Rollback guidance:** Prefer forward-fix migrations for `202611170011` and schema-additive migrations rather than destructive `DROP` rollbacks that risk data loss; if rolling back application containers, restore from the pre-migration database snapshot only when schema incompatibility requires it.

## 5. Known Operational & Verification Limitations

- **Remote Supabase Migration Status (`009`–`014`):** Migrations `202611170009` through `202611170014` are marked `LOCAL ONLY` in-repo; their remote application status and remote schema equivalence remain **UNKNOWN / NOT VERIFIED** until checked by an authorized operator.
- **Docker Build & Runtime Verification:** Static `docker compose config --quiet` validation passed, but live `docker compose build` and `docker compose up -d` container startup/healthcheck transitions have **not** been verified in an active Docker daemon in this workspace.
- **BusyBox `awk` Runtime Verification:** `client/docker-entrypoint.d/40-runtime-config.sh` was verified using POSIX `sh`/`awk` (Git Bash) + `node:vm`, but BusyBox `awk` inside the actual `nginx:alpine` target image has not been executed live.
