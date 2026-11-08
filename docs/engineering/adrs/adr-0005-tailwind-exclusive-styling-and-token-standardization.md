# ADR 0005: Tailwind CSS Exclusive Styling & Design Token Standardization

* **Status:** Accepted  
* **Date:** 2026-11-16  
* **Deciders:** Engineering Team  
* **Consulted:** Design System Lead, Frontend Developers, Architecture Lead  
* **Informed:** All Contributors  

---

## 1. Context

During earlier phases of SpendWise development, frontend styling was managed through a fragmented hybrid architecture consisting of:
1. A global design token stylesheet (`client/src/shared/styles/tokens.css`) containing duplicated and conflicting aliases (e.g., reciprocal `--space-*` and `--spacing-*` scales, one-off tokens, hardcoded shadow strings).
2. Global reset and base rules (`reset.css`, `base.css`).
3. 13 modular component stylesheets in `client/src/shared/styles/components/` (`alerts.css`, `badges.css`, `buttons.css`, `cards.css`, `chart.css`, `chat.css`, `common.css`, `drawer.css`, `forms.css`, `layout-primitives.css`, `tables.css`, `toast.css`, `typography.css`).
4. 3 layout and feature-level stylesheets (`client/src/layouts/workspaceLayout.css`, `client/src/features/auth/auth.css`, `client/src/features/analytics/analytics.css`).
5. A partial Tailwind CSS (`v3.4.19`) configuration in `client/tailwind.config.js` that mapped only a fraction of the design token tokens.

This hybrid approach resulted in significant architectural friction:
- **Style Duplication & Cascade Conflicts:** Developers had to maintain styles across both CSS files and JSX templates, leading to specificity conflicts where Vanilla CSS classes competed with Tailwind utility classes.
- **Token Drift:** Color codes, spacing values, font sizes, border radii, and z-index values drifted across files, with contradictory definitions between CSS variables and Tailwind themes.
- **Bundle & Maintenance Overhead:** Shipping 19 separate CSS stylesheets created unnecessary HTTP/bundler complexity and rendered dead-code elimination difficult.
- **Inconsistent Component Encapsulation:** Base Primitives and Composites relied on an uneven mix of external CSS classes and utility classes, complicating accessibility and variant testing.

## 2. Decision Drivers

1. **Single Source of Truth:** Unify all frontend styling into a single, cohesive design system driven by centralized token definitions.
2. **Elimination of Dead and Duplicated CSS:** Replace 19 disparate Vanilla CSS stylesheets with zero-runtime utility classes generated at build time.
3. **Design System & Component Encapsulation:** Enforce strict component variant APIs where Primitives and Composites own their internal styling and strip external `className` and `style` escape hatches.
4. **Predictable Layout vs. Appearance Boundaries:** Primitives manage internal appearance, while Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) govern external spacing and arrangement.
5. **Performance & Bundle Optimization:** Minimize CSS chunk size and leverage Tailwind's purge mechanism to eliminate dead styles from the production bundle.
6. **Robust Behavioral Verification:** Guarantee that all component variants, interactive states, and accessibility contracts are verified using live DOM assertions rather than brittle filesystem stylesheet inspections.

## 3. Considered Alternatives

* **Alternative 1: Pure Vanilla CSS with CSS Modules:**
  - *Description:* Retain modular `.css` files and convert them to CSS Modules (`[name].module.css`) to prevent global cascade leakage.
  - *Rejection Reason:* Does not solve token drift or reciprocal spacing aliases. Retains dozens of stylesheet files, increases boilerplate for simple layouts, and lacks standardized atomic utilities for responsive design and state variants.
* **Alternative 2: Continued Hybrid CSS + Tailwind:**
  - *Description:* Keep `tokens.css` and component stylesheets while using Tailwind utilities ad-hoc across new pages.
  - *Rejection Reason:* Perpetuates specificity wars, cascade unpredictability, duplicate property definitions, and developer confusion over where styles belong.
* **Alternative 3: CSS-in-JS (e.g., Styled Components or Emotion):**
  - *Description:* Implement CSS-in-JS styled primitives.
  - *Rejection Reason:* Adds runtime execution overhead, increases client bundle weight, degrades SSR/Vite build speed, and introduces unnecessary dependencies incompatible with our lean architecture.

## 4. Decision

We establish **Tailwind CSS (`v3.4.19`) as the exclusive styling system** across the SpendWise frontend application (`client/`), structured under the following mandates:

### 4.1 Single Global Stylesheet Entry Point & Token Architecture
All 19 legacy standalone `.css` files are deleted. A single global stylesheet entry point is established at `client/src/index.css`:
1. **Design Token Source of Truth (`FE-FIX-12E`):** `client/tailwind.config.js` is the canonical source of truth for all Tailwind utility scales (screens, colors, spacing, typography, sizing, borders, shadows, z-index, animations).
2. **Runtime CSS Custom Properties (`:root`):** The `:root` block in `client/src/index.css` is streamlined to define strictly the 6 runtime CSS custom properties needed for baseline defaults and runtime SVG rendering:
   - Global baseline defaults consumed by `@layer base`: `--font-family-sans`, `--color-bg-page`, `--color-text-primary`, `--line-height-normal`.
   - Runtime SVG dynamic rendering in `AnalyticsCharts.jsx`: `--color-slate-200`, `--color-slate-500`.
   This optimization eliminated redundant `:root` duplicates and reduced compiled `index.css` from 51.24 kB to 39.94 kB.
3. **Tailwind Directives:** Emits `@tailwind base;`, `@tailwind components;`, and `@tailwind utilities;`.
4. **`@layer base` Defaults:** Encapsulates box-sizing resets, `#root` viewport height constraints, and default body typography/background colors.

### 4.2 Centralized Design Token System (`client/tailwind.config.js`)
All design tokens are standardized in `client/tailwind.config.js` and synchronized with `:root` CSS variables in `client/src/index.css`:

1. **Color Scales:**
   - `brand`: `DEFAULT` (`#09090b`), `hover` (`#27272a`), `light` (`#bae6fd`).
   - `surface`: `DEFAULT` (`#ffffff`), `subtle` (`#f8fafc`), `muted` (`#f1f5f9`), `hover` (`#e2e8f0`), `glass` (`rgba(255, 255, 255, 0.72)`).
   - `content`: `primary` (`#0f172a`), `secondary` (`#334155`), `muted` (`#64748b`), `inverse` (`#ffffff`).
   - `border`: `DEFAULT` (`#e2e8f0`), `hover` (`#64748b`), `glass` (`rgba(255, 255, 255, 0.8)`).
   - `status`: `success`, `danger` / `error`, `warning`, `info` with unified `bg`, `border`, `text`, and `accent` values.
   - `domain`: `income` (green scale) and `expense` (red scale).
   - `sidebar`: `DEFAULT` (`#09090b`), `surface` (`rgba(9, 9, 11, 0.88)`), `fg` (`#ffffff`), `muted` (`#cbd5e1`), `active` (`rgba(255, 255, 255, 0.16)`), `hover` (`rgba(255, 255, 255, 0.1)`), `border` (`rgba(255, 255, 255, 0.22)`), `avatar` (`rgba(255, 255, 255, 0.2)`).
   - `overlay`: `DEFAULT` (`rgba(15, 23, 42, 0.5)`), `blur` (`rgba(15, 23, 42, 0.4)`), `dark` (`rgba(0, 0, 0, 0.7)`).
2. **Spacing Scale:**
   - 4px numeric grid: `0` (0px), `0.5` (2px), `1` (4px), `1.5` (6px), `2` (8px), `2.5` (10px), `3` (12px), `3.5` (14px), `4` (16px), `5` (20px), `6` (24px), `7` (28px), `8` (32px), `10` (40px), `12` (48px), `14` (56px).
   - Semantic tokens: `none` (0px), `2xs` (2px), `xs` (4px), `sm` (8px), `md` (16px), `lg` (24px), `xl` (32px), `2xl` (48px).
3. **Typography Scale:**
   - `fontFamily`: `sans` (system font stack), `mono` (code stack).
   - `fontSize`: `2xs` (10px/1.2), `xs` (12px/1.4), `sm` (14px/1.5), `base` (15px/1.5), `lg` (18px/1.25), `xl` (24px/1.2), `2xl` (30px/1.15/-0.025em), `display` (`clamp(2.25rem, 4vw, 4rem)`/1/-0.06em).
   - `fontWeight`: `normal` (400), `medium` (500), `semibold` (600), `bold` (700).
   - `lineHeight`: `none` (1), `tight` (1.2), `snug` (1.25), `normal` (1.5), `relaxed` (1.6).
   - `letterSpacing`: `tighter` (-0.06em), `tight` (-0.025em), `normal` (0em), `wide` (0.05em), `wider` (0.09em).
4. **Border Radii:**
   - `sm`: 4px, `md`: 6px, `lg`: 8px, `xl`: 12px, `full`: 9999px.
5. **Box Shadows:**
   - `card`, `card-hover`, `button-hover`, `modal`, `drawer`, `push-drawer`, `sidebar`, `toast`, `fab`, `focus`, `focus-danger`.
6. **Z-Index Scale:**
   - `sidebar`: 5, `assistant`: 20, `mobile-assistant`: 100, `mobile-drawer`: 101, `modal`: 1000, `backdrop`: 1000, `drawer`: 1001, `toast`: 2000.
7. **Layout Dimensions & Breakpoints:**
   - Widths / Paddings: `sidebar` (280px), `sidebar-compact` (178px), `push-drawer` (410px), `push-drawer-max` (`min(760px, 100vw)`), `drawer` (720px), `workspace` (1340px), `modal-sm` (400px), `modal-md` (520px), `modal-lg` (620px), `modal-xl` (760px).
   - Screens: `xs: 420px`, `mobile: 540px`, `tablet: 840px`, `desktop: 1120px`.

### 4.3 Strict Component Variant APIs & ClassName Stripping
All components in `client/src/primitives/**` and `client/src/composites/**` are authored strictly with Tailwind utility classes:
- **Zero External `className` or `style`:** Base Primitives and Composites do **not** accept arbitrary `className` or `style` props. Any consumer-supplied `className` or `style` is stripped from `rest` before rendering to the DOM node.
- **Explicit Semantic Props:** Appearance is driven entirely by controlled props (`variant`, `size`, `invalid`, `fullWidth`).
- **External Spacing Ownership:** Page layout, element margins, and arrangement are governed strictly by Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) or semantic container landmarks (`<header>`, `<section>`, `<form>`).

### 4.4 Exceptional CSS Policy
- **Prohibition:** Pure Vanilla CSS is strictly disallowed for ordinary component, layout, or feature styling. No standalone `.css` files may be introduced in `client/src/`.
- **Approval Gate:** Any custom Vanilla CSS rule requires explicit architectural review and is permitted only for complex visual effects that are technically impossible or prohibitively convoluted in Tailwind CSS.
- **Current Status:** Currently, **zero** Vanilla CSS exceptions exist across the codebase.
- **Data-Driven Inline Styles:** Dynamic inline `style` attributes are permitted exclusively for runtime-calculated, data-driven values (e.g., `ChartBar.jsx` calculating width percentage and dynamic `fillColor`).

## 5. Consequences

### Positive
* **Single Styling Paradigm:** Developers author all styling using consistent, unified Tailwind utility classes referencing standardized design tokens.
* **100% Elimination of Dead CSS:** Deleted 19 legacy `.css` files, completely eliminating unused class selectors, conflicting overrides, and specificity races.
* **Deterministic Build & Optimal Bundle Size:** Vite + Tailwind purges unused utilities, producing a compact, highly cacheable CSS bundle.
* **Robust Component Isolation:** Consumers cannot inadvertently break component padding, typography, or focus states with arbitrary class injection.
* **Test Maintainability:** Tests verify behavioral rendering, DOM roles, and ARIA attributes without depending on brittle CSS file existence or raw classname regexes.

### Negative / Trade-offs
* **Strict Discipline Required:** Developers cannot use quick `className="mt-2"` patches on Primitives or Composites; they must compose layouts using `Stack`, `Inline`, `Spacer`, or container elements.
* **Initial Migration Effort:** Required migrating every primitive, composite, layout shell, and feature view across the entire repository to pure Tailwind utilities.

## 6. Related References

* **Architecture Reference:** [`docs/engineering/architecture.md`](../architecture.md) (Sections 1, 2, 3, 5, 7, 11)
* **Preceding Architecture Decision:** [`docs/engineering/adrs/adr-0001-frontend-six-layer-architecture.md`](./adr-0001-frontend-six-layer-architecture.md) (Layered hierarchy preserved; Vanilla CSS layer superseded)
* **Controlled Prop Decision:** [`docs/engineering/adrs/adr-0003-controlled-component-variant-api.md`](./adr-0003-controlled-component-variant-api.md)
* **Refactoring Plan Task:** `FE-REF-11` in [`docs/engineering/refactoring-plan.md`](../refactoring-plan.md)
* **Verification Suite:** [`tests/unit/frontendStandardization.test.js`](../../../tests/unit/frontendStandardization.test.js) (consolidated canonical suite, 653 tests across 187 suites)
