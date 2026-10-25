---
name: implement-feature
description: Implement a feature in SpendWise by following existing architecture, reuse patterns, validation, error handling, and testing conventions.
---

# Implement Feature

1. Inspect the current implementation, analogous features, Git status, API contracts, relevant docs, and test scripts before editing.
2. Define the smallest end-to-end scope: UI/API, validation, business logic, persistence, errors, and tests as applicable.
3. Reuse shared components, hooks, utilities, infrastructure, and conventions when they genuinely fit. Avoid duplicate systems and unnecessary dependencies.
4. Keep responsibilities separated: UI, API client, route/controller, service, repository, and pure utilities should not absorb unrelated work.
5. Validate external input at the appropriate boundaries. Preserve backend validation and authorization; never invent authentication or user identities.
6. For AI/RAG work, preserve grounding, guardrails, provider abstraction, and safe handling of missing/invalid output.
7. Add focused tests for normal behavior, boundary cases, and failures. Update docs only where the feature changes architecture or setup.
8. Verify with relevant tests, build/lint/import checks available, and `git diff --check`. Report exact outcomes and limitations. Preserve user changes; do not commit or push unless asked.
