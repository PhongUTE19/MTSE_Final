# SpendWise Academic SRS Package

This folder contains the self-contained Software Requirements Specification (SRS) package for SpendWise, aligned with the verified codebase on branch `provider-adapter`.

## Reading Guide

1. [`01-scope-and-user-roles.md`](./01-scope-and-user-roles.md) — System overview, in-scope/out-of-scope boundaries, actors, and role permissions.
2. [`02-business-rules.md`](./02-business-rules.md) — Authoritative business rules (`BR-001` through `BR-014`) with implementation traceability.
3. [`03-use-case-diagram.md`](./03-use-case-diagram.md) — System use case diagram (`UC-001` through `UC-011`) and relationships.
4. [`04-use-case-specifications.md`](./04-use-case-specifications.md) — Detailed use case specifications mapped to business rules.
5. [`05-system-architecture.md`](./05-system-architecture.md) — Logical and physical deployment architecture and component boundaries.
6. [`06-data-design-erd.md`](./06-data-design-erd.md) — Local PostgreSQL schema ERD, RLS/RPC design, and IndexedDB boundary.
7. [`07-sequence-diagrams.md`](./07-sequence-diagrams.md) — Core workflow sequence diagrams (Receipt OCR/Confirm, Unified AI SSE, Admin Reindex).
