---
name: refactoring-ui
description: Apply the practical UI design tactics from "Refactoring UI" (Adam Wathan & Steve Schoger). Use when improving the visual polish of an existing interface — spacing, hierarchy, color, typography, depth, empty states — without a full redesign. Trigger on requests like "make this look better", "tidy up this component", "the layout feels off", "improve spacing/contrast/hierarchy".
---

You apply the concrete, opinionated tactics from *Refactoring UI*. This is about incremental visual polish, not redesign or branding. Work directly on the code (Tailwind 4 in this repo — prefer utility classes and design tokens).

## Working method

1. Look at the actual rendered UI (or the JSX/CSS). Identify the 3–5 biggest offenders.
2. Fix in this priority order: hierarchy → spacing → color → typography → depth → finishing touches.
3. Make the change, don't just describe it.

## Tactics

**Start with too much white space, then remove.** Generous spacing reads as premium. Default to more padding than feels natural.

**Establish hierarchy by de-emphasizing, not emphasizing.** Don't make the important thing bigger — make secondary things smaller, lighter, greyer. Use font weight and color before size. Labels are usually noise: combine label+value, drop the label, or make it tiny.

**Size and spacing: don't use a linear scale.** Use a ratio-based scale (4, 8, 12, 16, 24, 32, 48, 64...). Limit yourself to it. In this repo use Tailwind's spacing scale, don't invent arbitrary px values.

**Color: you need more colors than you think, not fewer.** One grey isn't enough — you need 8–10 shades. Same for your primary. Use HSL: adjust hue toward 60°/180° for "lighter", toward 270°/0° for "darker"; rotate hue rather than just dropping lightness. Don't use pure grey — tint it slightly (cool or warm). Accessible contrast: don't put grey text on colored backgrounds — pick a color with the same hue, lower saturation, adjusted lightness.

**Emphasize by de-emphasizing siblings.** A primary button works because the secondary button is just an outline or link.

**Typography:** Pick a good font (system stack or a real typeface, not Inter-by-default). Line length 45–75 chars. `line-height` is proportional to font size — tight for headlines, loose (1.5–1.7) for body. Don't center long-form text. Align numbers right; consider tabular figures. Letter-spacing: tighten large headings slightly, loosen all-caps.

**Depth:** Light comes from above — top edge lighter, bottom shadow. Use shadow elevation consistently (5-step scale): small shadow = slightly raised, large blurred shadow = floating/modal. Combine a tight dark shadow with a larger soft one.

**Make text on images readable:** add a semi-transparent overlay, or a subtle gradient, or lower the image contrast, or text-shadow — never raw text on a busy photo.

**Borders are a crutch.** Instead of a border, try: a box shadow, two different background colors, or extra spacing.

**Empty states are not edge cases.** Design them first — they're a user's first impression. Big icon/illustration, clear headline, a CTA.

**Supercharge the basics.** The "boring" core screens (a table, a form, a list) deserve the most attention — that's where users live.

**Don't over-rely on borders for tables/forms** — zebra striping, spacing, or a subtle background beats grid lines.

## When done

Summarize the specific changes made (file:line) and the rationale in one or two sentences each. Don't pad.
