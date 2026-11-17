# SpendWise — Documentation Structure & Maintenance Guide

> **Status:** Authoritative Documentation Index & Governance Reference  
> **Updated:** 2026-11-18 (`P5-T02`)

---

## 1. Purpose & Scope

This document defines SpendWise's canonical documentation structure after Phase 5 consolidation. Historical task reports (`docs/reports/`), superseded pre-implementation designs (`docs/engineering/archive/`), and dated audit snapshots (`docs/engineering/audits/`) were removed after migrating their enduring architectural decisions, API/database contracts, and operational limitations into the maintained canonical documents below.

---

## 2. Canonical Documentation Directory Map

```text
├── README.md                                  # Repository overview, quickstart, Docker workflow, documentation index
├── AGENTS.md                                  # AI coding agent handbook, conventions, verification commands
└── docs/
    ├── academic/
    │   ├── SRS/                               # Complete 7-part Academic SRS package + README.md index
    │   │   ├── 01-scope-and-user-roles.md
    │   │   ├── 02-business-rules.md
    │   │   ├── 03-use-case-diagram.md
    │   │   ├── 04-use-case-specifications.md
    │   │   ├── 05-system-architecture.md
    │   │   ├── 06-data-design-erd.md
    │   │   └── 07-sequence-diagrams.md
    │   ├── architecture.md                    # Evaluator-facing system design & multi-service overview
    │   ├── user-stories.md                    # Milestone 1 user stories & acceptance criteria
    │   ├── ai-usage.md                        # Academic AI usage disclosure & review log
    │   ├── adrs/                              # Academic ADRs (0001–0003)
    │   └── ai-data-flows/                     # Source-traceable AI data flows (README + 01–05)
    └── engineering/
        ├── architecture.md                    # Canonical 6-layer frontend & modular backend architecture
        ├── api-reference.md                   # Authoritative Express 4 REST & SSE API contracts
        ├── database-and-data-lifecycle.md     # Local PostgreSQL baseline, RLS/RPCs, IndexedDB staging
        ├── deployment-checklist.md            # Controlled Docker & Supabase migration deployment checklist
        ├── documentation-maintenance.md       # This documentation structure & maintenance guide
        ├── implementation-guidelines.md       # Technical invariants, coding standards & bootstrap DDL
        ├── progress.md                        # Chronological verification & milestone tracker
        ├── refactoring-plan.md                # Living engineering backlog & completed task matrix
        └── adrs/                              # Engineering ADRs (0001–0009)
```

---

## 3. Responsibilities of Retained Documents

- **Academic SRS (`docs/academic/SRS/`):** Self-contained academic specification covering scope/roles, business rules (`BR-001`–`BR-014`), use case diagram and 9-field tabular specifications (`UC-001`–`UC-011`), logical/physical architecture, local ERD, and workflow sequence diagrams.
- **`docs/engineering/architecture.md`:** Canonical implementation architecture (6-layer frontend, backend feature modules, provider boundaries, and consolidated Phase 2–4 limitations).
- **`docs/engineering/api-reference.md`:** Active Express 4 REST and SSE endpoints, auth/role guards, Zod validation, rate limiting, and health probes (excluding retired endpoints).
- **`docs/engineering/database-and-data-lifecycle.md`:** PostgreSQL tables/RPCs defined by local migrations (`20261020000000`–`202611170014`) separated from browser-local IndexedDB `TransactionDraft` staging.
- **`docs/engineering/deployment-checklist.md`:** Ordered migration checklist (`009`–`014`), Docker Compose validation, and operational limitations.
- **`docs/engineering/adrs/` (`adr-0001`–`adr-0009`):** Architectural Decision Records preserving design context, trade-offs, and implementation references.

---

## 4. Consolidated Historical Decisions & Destinations

| Consolidated Topic | Canonical Destination |
| :--- | :--- |
| Frontend 6-layer architecture, drawers, controlled variants, Tailwind CSS | `docs/engineering/architecture.md`, `adr-0001`–`adr-0005` |
| IndexedDB `TransactionDraft` staging & legacy server draft retirement | `docs/engineering/database-and-data-lifecycle.md`, `adr-0006`, `02-business-rules.md` |
| Stateless receipt OCR & atomic `confirm_staged_receipt_transaction` RPC | `api-reference.md`, `database-and-data-lifecycle.md`, `07-sequence-diagrams.md` |
| Unified Assistant (`CHAT_STRATEGY=unified`), server-authoritative history & SSE lifecycle | `adr-0007`, `api-reference.md`, `07-sequence-diagrams.md` |
| Git-managed read-only prompts/docs, `spendwise_active` alias & `usage_source` | `adr-0008`, `api-reference.md` |
| `TRUST_PROXY`, `CORS_ORIGIN`, `/api/health`, `/api/health/live`, graceful shutdown, Docker runtime config | `adr-0009`, `api-reference.md`, `deployment-checklist.md` |

---

## 5. Known Limitations & Verification Status

1. **PostgREST Literal `*` Matching:** `encodePostgrestIlikeTerm()` escapes `*` as `\\*` to prevent unbounded wildcard broadening, but exact literal `*` matching is not guaranteed under PostgREST `*` → `%` translation without a dedicated PostgreSQL RPC.
2. **Live Docker Build & Startup:** `docker compose config --quiet` passed, but live `docker compose build` and `docker compose up -d` container startup/healthchecks have not been verified in an active Docker daemon in this workspace.
3. **BusyBox `awk` Target Runtime:** `client/docker-entrypoint.d/40-runtime-config.sh` was tested with POSIX `sh`/`awk` (Git Bash) + `node:vm`, not yet inside the live `nginx:alpine` BusyBox runtime.
4. **Remote Supabase Migration Status (`009`–`014`):** Migrations `202611170009`–`202611170014` are marked `LOCAL ONLY` in-repo; remote application status and remote schema equivalence remain **UNKNOWN / NOT VERIFIED**.
5. **Qdrant Reindex Locking:** Shadow-collection reindexing uses an in-process lock; distributed locking for multi-process deployments remains a separate concern.

---

## 6. Documentation Maintenance Guidelines

- Update canonical documents in place rather than creating dated duplicate architecture specs or standalone task report folders.
- Keep `AGENTS.md`, `README.md`, and `docs/engineering/` aligned whenever routes, environment variables, migrations, or architectural boundaries change.
- Never claim remote Supabase state or live Docker runtime behavior without observed verification evidence.

---

## 7. Remaining Documentation Gaps

- Live runtime verification notes (Docker Compose container healthchecks, BusyBox `awk` execution in `nginx:alpine`, and remote Supabase migration `009`–`014` confirmation) should be recorded in `docs/engineering/deployment-checklist.md` once executed by an authorized operator.
- Legacy `docs/academic/ai-data-flows/*` (and historical `adr-0001`, `adr-0002`, `adr-0004`) contain `159` pre-existing broken local file/line links pointing to pre-refactoring paths (`server/src/features/expenses/`, `client/src/features/receipts/`, `tests/setup/jsdom-environment.js`); all current canonical docs (`README.md`, `AGENTS.md`, `docs/academic/SRS/*`, `docs/engineering/architecture.md`, `api-reference.md`, `database-and-data-lifecycle.md`, `deployment-checklist.md`, `documentation-maintenance.md`, `adr-0007`–`0009`) have `0` broken local links.
