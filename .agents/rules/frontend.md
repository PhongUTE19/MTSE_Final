---
trigger: glob
globs: "client/**"
description: Frontend rules for React components, styling, state, validation, and shared UI behavior.
---

# Frontend Rules

- **Tailwind CSS v3.4.19 as Exclusive Styling System & Design Token Architecture:** Use Tailwind CSS utility classes exclusively for all component, layout, and feature styling. Do not create or import standalone `.css` files in `client/src/`; all 19 legacy stylesheets have been consolidated into `client/src/index.css` and `client/tailwind.config.js`.
  - `client/tailwind.config.js` is the canonical source of truth for all utility token scales.
  - `client/src/index.css` `:root` maintains strictly the 6 runtime CSS custom properties needed for baseline defaults (`--font-family-sans`, `--color-bg-page`, `--color-text-primary`, `--line-height-normal`) and runtime SVG rendering in `AnalyticsCharts.jsx` (`--color-slate-200`, `--color-slate-500`).
- **Centralized Design Token Consumption:** All styling must consume standardized design tokens defined in `client/tailwind.config.js` and `client/src/index.css`:
  - Colors: `brand`, `surface`, `content`, `border`, `success`, `danger`/`error`, `warning`, `info`, `income`, `expense`, `sidebar`, `overlay`.
  - Spacing: 4px grid (`0`..`14`) and semantic spacing tokens (`none`, `2xs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`).
  - Typography: `fontFamily` (`sans`, `mono`), `fontSize` (`2xs`..`display`), `fontWeight`, `lineHeight`, `letterSpacing`.
  - Radii (`sm: 4px`, `md: 6px`, `lg: 8px`, `xl: 12px`, `full: 9999px`), Shadows (`card`, `modal`, `drawer`, `sidebar`, `toast`, `focus`, etc.), Z-Index (`sidebar: 5`, `assistant: 20`, `mobile-assistant: 100`, `mobile-drawer: 101`, `modal: 1000`, `backdrop: 1000`, `drawer: 1001`, `toast: 2000`), Layout Dimensions (`sidebar: 280px`, `push-drawer: 410px`, `drawer: 720px`, `workspace: 1340px`, etc.), and Screens (`xs`, `mobile`, `tablet`, `desktop`).
- **Strict Component Variant APIs & ClassName Stripping:** Base Primitives (`primitives/`) and Composites (`composites/`) must **not** accept external `className` or `style` props. Strip them from `rest` before rendering to native DOM nodes. Control appearance strictly through explicit semantic props:
  - `Button`: `variant` (`primary`, `secondary`, `outline`, `ghost`, `danger`, `chip`, `fab`, `sidebar`, `sidebar-active`, `sidebar-secondary`), `size` (`sm`, `md`, `lg`).
  - `Avatar`: `variant` (`default`, `dark`, `brand`, `sidebar`), `size` (`sm`, `md`, `lg`).
  - `Text`: `variant` (including `sidebar-eyebrow`), `color` (including `sidebar`, `sidebar-muted`).
  - `Card`: responsive padding scale (`sm`, `md`, `lg`, `xl`).
  - `TextInput`: `size` (`sm`, `md`, `lg`), `endPadding` (`none`, `sm`, `lg`).
  - `TextArea`: `size` (`sm`, `md`), `resize` (`vertical`, `none`), `maxHeight` (`none`, `composer`).
  - `PasswordInput`: encapsulates endPadding and visibility toggle.
- **Layout vs. Appearance Separation:** Primitives own internal appearance (padding, colors, borders, focus rings). External spacing, margin, and positioning must be handled by Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) or semantic container elements (`<header>`, `<section>`, `<form>`).
- **Exceptional CSS Policy:** Pure Vanilla CSS is strictly disallowed for ordinary component or feature styling (zero exceptions currently exist). Inline styles (`style={{ ... }}`) are permitted exclusively for dynamic data-driven values calculated at runtime (e.g. `ChartBar.jsx` percentage widths and dynamic colors).
- **PushDrawer vs. OverlayDrawer Architecture:** Keep companion side panels (`PushDrawer` for AI chat) non-modal without backdrop or scroll locking; keep modal slide-overs (`OverlayDrawer` for document inspection) strictly modal with `Backdrop`, scroll locking, and focus trapping.
- **Single-Currency VND Ledger Invariant:** `public.expense_transactions` stores amounts in VND. Never silently convert foreign currencies; flag non-VND receipts with explicit warnings and require human review.
- **UTC Calendar Date Validation:** Validate calendar dates with UTC round-trip verification to prevent rollover bugs (e.g. `2026-02-30` rolling over to `2026-03-02`).
- Keep functional icons accessible. Do not add emojis, emoticons, or decorative icon glyphs to application-owned user-facing text.
- Extract repeated JSX into shared components only when structure or behavior is genuinely shared. Extract repeated React state/effects into custom hooks; use ordinary functions for pure JavaScript calculations.
- Keep state local when only one small component uses it. Lift shared state to the common parent or use the existing state-management approach when multiple components need it.
- Keep API requests in the established client API modules, not embedded directly in UI components. Keep request/response contracts consistent.
- Centralize reusable input validation and messages where useful. Use native HTML constraints appropriately, and do not remove or weaken server-side validation.
- Reuse search, sorting, filtering, and pagination logic/UI where appropriate. Keep page-specific rules in the feature and use server-side querying for larger datasets.
- Make loading, empty, error, online, and offline states explicit. Prevent repeated requests and duplicate toasts during a single offline incident; provide a clear retry path.
- Preserve existing appearance, responsive behavior, keyboard accessibility, and valid user workflows unless the task explicitly changes them.
