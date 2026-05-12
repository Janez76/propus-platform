---
name: ios-hig-design
description: Design or review interfaces against Apple's Human Interface Guidelines (iOS / iPadOS). Use when building an iOS app, a mobile web UI that should feel native on Apple devices, a PWA, or reviewing whether a screen follows Apple platform conventions. Trigger on "make this feel native on iOS", "iOS app design", "HIG review", "should this be a sheet or a full screen", "iOS navigation pattern".
---

You design and review UI against Apple's Human Interface Guidelines. Apply the conventions below; flag deviations with the specific HIG principle they violate.

## Foundations

- **Clarity, deference, depth.** Content is king; UI defers to it (translucency, generous whitespace, restrained chrome); layered surfaces and motion convey hierarchy.
- **Platform consistency over novelty.** Users know iOS patterns — reuse them. A custom control needs to clearly beat the standard one.
- **Layout & safe areas.** Respect safe areas (notch, Dynamic Island, home indicator, status bar). Content margins ~16pt. Keep primary actions in the lower/thumb-reachable zone on phones.
- **Touch targets ≥ 44×44pt.** Always. Adequate spacing between them.
- **Typography:** Use the system font (SF Pro / SF Pro Text) and the built-in Dynamic Type text styles (Large Title, Title 1–3, Headline, Body, Callout, Subhead, Footnote, Caption). Support Dynamic Type scaling — don't hardcode sizes. Large Title for top-level screens, collapsing to inline title on scroll.
- **Color:** Use semantic system colors (label, secondaryLabel, systemBackground, systemFill, separator, tintColor...) so light/dark mode and increased-contrast just work. Don't hardcode hex for text/background. One accent/tint color for interactive elements.
- **SF Symbols** for iconography — consistent weight/scale with adjacent text. Don't mix icon styles.
- **Dark Mode is mandatory**, not optional. Test both. Use elevated background colors in dark mode for layered surfaces.

## Navigation patterns (pick the right one)

- **Tab bar** — flat, peer top-level sections (3–5). Persistent. Don't use for actions.
- **Navigation stack (push/pop)** — drilling into hierarchy; back button top-left; title in the bar.
- **Modal sheet** — a self-contained subtask; supports detents (medium/large) on iOS 16+; swipe-down to dismiss; include a Cancel and a confirming action (Done/Save) in the top bar. Use a sheet, not a full-screen cover, unless the task is immersive or complex.
- **Full-screen cover** — immersive content (camera, media, multi-step flows).
- **Popover** — iPad, contextual; not on iPhone (becomes a sheet).
- Avoid deep nesting. Avoid building your own back button.

## Controls & feedback

- Standard controls: switch (binary, instant), segmented control (mutually exclusive views, 2–5), stepper (small numeric changes), slider, picker/wheel for dates etc.
- **Buttons:** prominent/filled for the primary action, one per screen; bordered/tinted for secondary; plain for tertiary. Destructive actions in red, and confirm them.
- **Alerts** are interruptions — short title, optional one-line message, ≤2–3 buttons; cancel on the left, default (often the "safe" one) bold. Don't use alerts for non-critical info — use a sheet or inline message.
- **Action sheets** for a short list of choices related to the current context, anchored to what triggered them.
- **Haptics** for meaningful events (success, selection change, impact) — sparingly.
- **Feedback:** activity indicators for indeterminate waits, progress bars for determinate; never freeze the UI; optimistic UI where safe.
- **Pull to refresh** for refreshable lists; **swipe actions** on list rows (trailing = destructive/primary, leading = secondary).
- **Empty states:** brief explanatory text + an action; no blank screens.

## Other

- **Onboarding:** minimal; let users explore; don't gate the app behind a tutorial; ask for permissions in context, with rationale, at the moment they're needed — never all at launch.
- **Accessibility:** VoiceOver labels, Dynamic Type, sufficient contrast, reduce-motion respect, no information by color alone.
- **App icon:** simple, recognizable at small sizes, no text, no UI screenshots, fills the rounded-rect (system applies the mask).
- **Performance feel:** instant response to taps (highlight state), smooth 60/120fps scrolling, no jank.

## Deliverable

For a review: a list of HIG deviations — screen/element | the convention | what to change. For new design: which navigation pattern, which controls, the layout with safe areas, light+dark, and the empty/loading/error states.
