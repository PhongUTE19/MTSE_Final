# ADR 0004: Behavioral Component Testing Harness with JSDOM and JSX Loader

* **Status:** Accepted  
* **Date:** 2026-11-15  
* **Deciders:** Engineering Team  
* **Consulted:** QA Lead, Frontend Engineers  
* **Informed:** All Contributors  

---

## 1. Context

Historically, frontend unit tests in SpendWise relied heavily on filesystem reads (`fs.readFileSync`) and regular expressions (`/variant="primary"/`) to verify that React components were implemented correctly. These tests were brittle: trivial formatting changes or variable renames caused tests to fail even when the component rendered and behaved perfectly in the browser. Conversely, source regexes could not test user interactions (clicks, keyboard focus traps, `Escape` key handling) or dynamic state transitions.

## 2. Decision Drivers

1. **Behavioral Testing Principle:** Test user behavior and DOM output rather than implementation details and raw source code strings.
2. **Zero Heavy Tooling Overhead:** Avoid introducing heavy, slow test runners (such as Jest, Karma, or complex Babel/Webpack configurations) when Node.js has a built-in native test runner.
3. **Speed & Determinism:** Full unit test suite must run in under 20 seconds completely offline.

## 3. Considered Alternatives

* **Alternative 1: Jest + Babel:** Rejected due to heavy dependency footprints, complex configuration, and slow execution on Windows.
* **Alternative 2: Vitest:** Viable, but would duplicate existing `node:test` execution pipelines for backend tests.
* **Alternative 3: Continue with Source Regex Inspection:** Rejected because regex testing cannot verify event handling, accessibility attributes, or DOM rendering.

## 4. Decision

Build a lightweight, zero-dependency-overhead testing harness directly on Node.js native test runner (`node:test`) and Node.js assertions (`node:assert/strict`):

1. **JSDOM Browser Simulation (`tests/setup/jsdom-environment.js`):**
   - Configures standard browser globals (`window`, `document`, `navigator`, `localStorage`, `HTMLElement`, `CustomEvent`).
2. **Custom ESM JSX Loader Hook (`tests/setup/jsx-loader.js`):**
   - Uses Node.js module customization hooks (`--import tests/setup/jsx-loader.js`) to transform JSX into standard `React.createElement` syntax on the fly without build artifacts.
3. **React Testing Library Integration (`@testing-library/react`):**
   - Standardizes tests on `render()`, `screen.getByRole()`, `fireEvent.click()`, and `fireEvent.keyDown()`.
4. **Behavioral Assertions:**
   - Tests assert on computed attributes (`aria-expanded`, `role`, `disabled`), rendered text nodes, and keyboard interaction flows.

## 5. Consequences

### Positive
* True behavioral verification: tests catch real user-facing bugs rather than cosmetic source changes.
* High execution speed: over 830 tests execute in under 18 seconds on native Node.js.
* Single unified test command (`npm test`) runs all backend and frontend tests without switching test runners.

### Negative / Trade-offs
* Browser-specific visual layout (CSS box models, pixel bounding rects) is simulated via JSDOM and requires real browser E2E (Playwright) for full pixel verification (`TECH-03` in refactoring backlog).

## 6. Related References

* Architecture Reference: [`docs/engineering/architecture.md`](../architecture.md)
* Implementation Task: `FE-TEST-08` in [`docs/engineering/refactoring-plan.md`](../refactoring-plan.md)
* Setup Files: [`tests/setup/jsdom-environment.js`](../../../tests/setup/jsdom-environment.js), [`tests/setup/jsx-loader.js`](../../../tests/setup/jsx-loader.js)
* Verification: [`tests/unit/frontendStandardization.test.js`](../../../tests/unit/frontendStandardization.test.js)
