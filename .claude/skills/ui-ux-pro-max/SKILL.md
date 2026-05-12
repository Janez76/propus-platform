---
name: ui-ux-pro-max
description: End-to-end, opinionated UI/UX overhaul of a feature or screen — combines product thinking, information architecture, interaction design, visual design, accessibility, and polish into one pass. Use for ambitious "make this great", full-page redesigns, or when the user wants the works rather than a single targeted tweak. For small polish use refactoring-ui; for pure usability audit use ux-heuristics; for Apple-specific use ios-hig-design.
---

You run a complete, senior-level UI/UX pass. This is the "do everything, do it well" skill. Be opinionated. Ship working code (this repo: Next.js 16, React 19, Tailwind 4, TypeScript — use design tokens, not arbitrary values).

## Phase 1 — Understand (don't skip)

- **Who** uses this and **what job** are they hiring the screen to do? What's the one primary task; what's secondary; what's noise?
- **Context of use:** frequency, device, urgency, expertise, emotional state.
- **Current pain:** what specifically is wrong now — be concrete.
- **Constraints:** existing components, backend shape, the repo's "portal mirrors admin tour panel" rule, German UI / English code, performance budget.
- State the **success criteria** in one line before designing.

## Phase 2 — Structure (IA & flow)

- Cut scope to the primary task. Move secondary stuff to progressive disclosure (accordion, "more", a detail view).
- Map the flow: entry → steps → success state → error states → empty state. Each transition needs feedback.
- Decide the navigation/layout pattern (page, modal, sheet, wizard, split view) and justify it.
- Define the content hierarchy: what's the H1, what's the primary action, what can be de-emphasized or removed entirely. When in doubt, remove it.

## Phase 3 — Interaction design

- Specify every state for every component: default, hover, focus, active, disabled, loading, empty, error, success.
- Forms: minimal fields, smart defaults, inline validation, clear required/optional, sensible tab order, autofocus the first field, submit on Enter, disable submit only with a reason shown, optimistic UI where safe.
- Error handling: plain language next to the cause, never raw codes, always a way forward; destructive actions confirm and are undoable where possible.
- Accelerators: keyboard shortcuts, bulk actions, saved filters — without blocking beginners.
- Loading: skeletons over spinners for layout-stable content; never block the whole UI; show progress for long ops.

## Phase 4 — Visual design (apply Refactoring-UI tactics)

- Hierarchy via de-emphasis (weight & color before size); kill redundant labels.
- Spacing on a ratio scale, generous by default (Tailwind scale only).
- Color: full grey + primary ramps via HSL/hue-shift; tinted greys; accessible text-on-color; semantic tokens; dark mode if the app has it.
- Typography: real typeface, 45–75ch line length, proportional line-height, no centered paragraphs, tabular figures for numbers, tightened large headings.
- Depth: light-from-above, consistent shadow elevation scale; borders are a last resort (try shadow / bg-contrast / spacing first).
- Imagery: overlay/gradient/contrast for readable text on photos.

## Phase 5 — Quality gates

- **Accessibility:** keyboard-only walkthrough, visible focus, contrast ≥ 4.5:1 (3:1 large), labels & `aria-*`, no info by color alone, respects reduce-motion, touch targets ≥ 44px.
- **Responsive:** works 320px → wide; no horizontal scroll; reachable actions; content reflows, not just shrinks.
- **Heuristic pass:** quick run through Nielsen's 10 (status visibility, control/freedom, consistency, error prevention, recognition-not-recall, minimalism, error recovery).
- **Empty/loading/error states actually designed**, not afterthoughts.
- **Performance:** no layout shift, no jank, lazy-load heavy stuff, image sizes sane.
- **i18n:** strings externalized, layouts tolerate longer German text.
- **Consistency with the rest of the app** (and the admin/portal mirroring rule).

## Deliverable

The actual code change, plus a tight changelog: what changed, why, file:line. Then the residual risks / things you'd want a real user test for. No filler.
