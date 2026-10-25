# SpendWise Assistant — Agent Guidelines

This package is a draft for review before adding it to the repository.

## Contents

### Workspace rules

Place these files under `.agents/rules/`:

- `project-basics.md`: always-on project-wide conventions.
- `frontend.md`: React client, CSS, state, validation, shared UI, and accessibility.
- `backend.md`: server boundaries, validation, middleware, persistence, and errors.
- `ai-and-rag.md`: model integration, grounding, guardrails, document indexing, and usage analytics.

The rules use Antigravity rule frontmatter. `frontend.md` and `backend.md` are scoped by file glob; `ai-and-rag.md` is model-selected when relevant.

### Reusable procedures

The procedures are provided as Agent Skills under `.agents/skills/`:

- `refactor-code/SKILL.md`: refactoring and cleanup.
- `implement-feature/SKILL.md`: implementing a feature consistently.
- `verify-changes/SKILL.md`: post-change verification.

Antigravity is transitioning legacy Workflows to Agent Skills. Skills are used here as the reusable workflow format so the procedures remain discoverable and can be invoked as `/refactor-code`, `/implement-feature`, and `/verify-changes` where supported.

## Before adopting

1. Review each rule against the actual current code and team preferences.
2. Remove any instruction that conflicts with project-specific architecture or a deliberate exception.
3. Keep rules focused on stable constraints; keep multi-step procedures in Skills.
4. Check the rules after major architecture changes so they do not become stale.

These files describe intended working conventions. They do not prove that the current implementation already follows them.
