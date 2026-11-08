# ADR 0003: Controlled Component Variant API & Elimination of External ClassName Escape Hatches

* **Status:** Accepted  
* **Date:** 2026-11-14  
* **Deciders:** Engineering Team  
* **Consulted:** Design System Lead, Frontend Developers  
* **Informed:** All Contributors  

---

## 1. Context

Across the client application, components routinely accepted arbitrary `className` and inline `style` props. Consumers frequently passed ad-hoc utility classes (`<Button className="mt-4 primary-button custom-padding">`), causing style collisions, unintended cascade overrides, broken focus rings, and visual regressions across different pages. Furthermore, arbitrary class merging made automated testing brittle and obscured design system ownership.

## 2. Decision Drivers

1. **Design System Integrity:** Prevent consumers from breaking token-based padding, borders, shadows, and focus states.
2. **Predictable Component APIs:** Force consumers to select from explicitly supported design variants rather than crafting ad-hoc CSS.
3. **Layout vs. Appearance Separation:** Distinguish internal component appearance from external page layout and spacing.

## 3. Considered Alternatives

* **Alternative 1: Unrestricted `className` Passthrough:** Rejected because it led to constant CSS regressions and duplicate styles across views.
* **Alternative 2: `tailwind-merge` Utility:** Rejected because allowing arbitrary overrides still leaves design tokens vulnerable to unpredictable consumer classes.

## 4. Decision

Enforce a strict controlled-prop API across all Base Primitives (`client/src/primitives/`):

1. **Zero External `className` or `style`:** Base Primitives (`Button`, `Card`, `Stack`, `Inline`, `Grid`, `TextInput`, `TextArea`, `Select`, `Text`, `Badge`, etc.) do **not** accept `className` or `style` props. Any passed `className` or `style` is explicitly stripped before attributes reach the DOM node.
2. **Controlled Visual Props:** Appearance variations are governed strictly through explicit props mapped to Design Tokens and internal Tailwind utility classes:
   - `variant`: Appearance intention (`primary`, `secondary`, `outline`, `ghost`, `danger`, `fab`).
   - `size`: Dimension scale (`sm`, `md`, `lg`).
   - `invalid`: Boolean error state applying accessible `--color-danger` styling.
3. **Layout Ownership:** External margins, spacing between elements, and positioning are governed exclusively by Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`) or semantic container landmarks (`<header>`, `<section>`, `<form>`).

## 5. Consequences

### Positive
* Design system tokens and appearance are 100% consistent across all pages and features.
* Eliminates dead CSS and conflicting cascade overrides.
* Component implementations can be styled and tested with complete confidence that external consumers will not break their layout.

### Negative / Trade-offs
* Developers cannot quickly patch a component's margin with an inline `className`. They must wrap elements in `Stack`, `Inline`, or use semantic feature layout containers.

## 6. Related References

* Architecture Reference: [`docs/engineering/architecture.md`](../architecture.md)
* Implementation Task: `STRICT-BASE-CLASSNAME-ELIMINATION` in [`docs/engineering/refactoring-plan.md`](../refactoring-plan.md)
* Verification: [`tests/unit/frontendStandardization.test.js`](../../../tests/unit/frontendStandardization.test.js)
