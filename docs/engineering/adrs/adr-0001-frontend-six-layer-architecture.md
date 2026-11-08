# ADR 0001: Frontend Six-Layer Architecture

* **Status:** Accepted  
* **Date:** 2026-11-15  
* **Deciders:** Engineering Team  
* **Consulted:** Frontend Developers, Product Owner  
* **Informed:** All Contributors  

---

## 1. Context

As SpendWise scaled from an initial prototype to a feature-complete personal expense and AI assistant application, the frontend codebase in `client/src/` suffered from blurring boundaries between generic UI building blocks, shared composite widgets, application shell infrastructure, and domain-specific feature logic. Generic buttons and inputs were intermixed with feature-specific styling, components imported haphazardly across sibling feature modules, and shared directories accumulated mixed concerns.

## 2. Decision Drivers

1. **Clear Separation of Concerns:** Distinguish atomic UI building blocks from multi-component patterns and domain business logic.
2. **Strict Unidirectional Dependency Direction:** Prevent circular references and cross-feature coupling.
3. **Reusability Without Domain Contamination:** Enable UI primitives and composites to be tested and evolved independently of backend contracts or auth sessions.
4. **Predictable Code Organization:** Provide contributors with unambiguous rules for where new files belong.

## 3. Considered Alternatives

* **Alternative 1: Feature-First Only (`features/` + monolithic `shared/components/`):** Rejected because `shared/components/` rapidly becomes an unmaintainable dumping ground for both atomic elements and complex multi-component widgets.
* **Alternative 2: Atomic Design (`atoms/`, `molecules/`, `organisms/`, `templates/`, `pages/`):** Rejected as overly verbose and often ambiguous regarding whether domain logic belongs in organisms or templates.
* **Alternative 3: Flat Layering:** Rejected due to lack of guardrails against cross-feature coupling.

## 4. Decision

Partition `client/src/` into a strict six-layer architecture with unidirectional downward imports:

1. **Layer 1: `primitives/`** — Pure, domain-agnostic atomic building blocks (`Button`, `Card`, `Stack`, `TextInput`, `Text`, `Backdrop`, etc.). Zero public `className` or `style` props.
2. **Layer 2: `composites/`** — Domain-agnostic multi-primitive components (`FormField`, `Pagination`, `Alert`, `PushDrawer`, `OverlayDrawer`, `SearchInput`).
3. **Layer 3: `features/`** — Self-contained domain modules (`admin`, `analytics`, `auth`, `categories`, `chat`, `documents`, `expense`, `home`, `knowledgeBase`, `receipts`, `systemPrompt`). Cross-feature direct imports are strictly forbidden.
4. **Layer 4: `layouts/`** — Page shells and persistent frame structures (`WorkspaceLayout`, `WorkspaceSidebar`).
5. **Layer 5: `shared/`** — Cross-cutting singletons, pure utilities, hooks, constants, and infrastructure. *(Note: The legacy Vanilla CSS stylesheet layer in `shared/styles/` was formally superseded by ADR-0005 / `FE-REF-11` in favor of exclusive Tailwind CSS utility classes and centralized tokens in `client/tailwind.config.js` and `client/src/index.css`.)*
6. **Layer 6: `app/`** — Top-level orchestration (`App.jsx`, `guards/`, `providers/`).

Dependency hierarchy is strictly unidirectional:
`app` $\rightarrow$ `features` $\rightarrow$ `layouts` $\rightarrow$ `composites` $\rightarrow$ `primitives` $\rightarrow$ `shared`.

> [!NOTE]
> **Styling Evolution (ADR-0005 Supersedence):** While this ADR's 6-layer component hierarchy and strict controlled-prop / `className` stripping invariants remain canonical, its legacy modular Vanilla CSS stylesheets (`shared/styles/components/*.css`, `reset.css`, `base.css`) have been superseded by [ADR-0005: Tailwind CSS Exclusive Styling & Design Token Standardization](./adr-0005-tailwind-exclusive-styling-and-token-standardization.md). All component layers now author styling exclusively via Tailwind CSS utilities.

## 5. Consequences

### Positive
* Clear boundaries prevent circular imports and reduce cognitive load for developers.
* Atomic primitives can be rigorously tested in isolation without mocking feature stores or HTTP clients.
* Domain modules are self-contained and can be refactored or deleted without unintended ripple effects.

### Negative / Trade-offs
* Requires disciplined enforcement via PR reviews and automated architectural tests (`tests/unit/globalComponentArchitectureRefactor.test.js`).
* Common logic between features must be consciously promoted to `shared/` or composed at the `app/` router layer.

## 6. Related References

* Architecture Reference: [`docs/engineering/architecture.md`](../architecture.md)
* Implementation Task: `FE-REF-07` in [`docs/engineering/refactoring-plan.md`](../refactoring-plan.md)
* Verification: [`tests/unit/globalComponentArchitectureRefactor.test.js`](../../../tests/unit/globalComponentArchitectureRefactor.test.js)
