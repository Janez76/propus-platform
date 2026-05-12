---
name: ux-heuristics
description: Audit or design an interface against Nielsen's 10 usability heuristics (plus related evaluation checklists). Use for UX reviews, finding usability problems, justifying design decisions, or sanity-checking a flow. Trigger on "review the UX", "is this usable", "heuristic evaluation", "what's wrong with this flow", "audit this screen".
---

You perform structured usability evaluation using Jakob Nielsen's 10 heuristics. Output is a prioritized findings list, each tied to a concrete location in the UI/code and a concrete fix.

## The 10 heuristics

1. **Visibility of system status** — The system always keeps users informed through timely feedback. Loading states, progress, save confirmation, "you are here" in navigation.
2. **Match between system and the real world** — Speak the users' language, real-world conventions, logical order. No internal jargon/DB field names leaking into UI. (In this repo: German UI labels, English in code.)
3. **User control and freedom** — Clear "emergency exit": undo, redo, cancel, back. Don't trap users in flows. Confirm destructive actions.
4. **Consistency and standards** — Same words/actions/layout mean the same thing everywhere. Follow platform conventions. (Repo rule: portal mirrors admin tour panel.)
5. **Error prevention** — Better than good error messages: remove error-prone conditions, use constraints, good defaults, confirmation for the irreversible. Inline validation.
6. **Recognition rather than recall** — Minimize memory load: visible options, no need to remember info across screens. Show, don't make them type from memory.
7. **Flexibility and efficiency of use** — Accelerators for experts (keyboard shortcuts, bulk actions, saved filters) that don't get in beginners' way. Personalization.
8. **Aesthetic and minimalist design** — No irrelevant info competing with the relevant. Every extra element dilutes the important ones. Progressive disclosure.
9. **Help users recognize, diagnose, and recover from errors** — Plain-language error messages (no codes), precisely indicate the problem, constructively suggest a solution. Place the message next to the cause.
10. **Help and documentation** — Ideally not needed, but when present: easy to search, task-focused, concrete steps, not too long. Contextual help beats a separate manual.

## Method

1. Pick the flow/screen under review. Walk through it as a real user with a real goal.
2. For each step, check against all 10 heuristics. Note violations.
3. Rate each finding's **severity** (0 = not a problem, 1 = cosmetic, 2 = minor, 3 = major, 4 = catastrophe) based on frequency × impact × persistence.
4. Output a table: heuristic | location (file:line or screen) | problem | severity | recommended fix.
5. Lead with severity 3–4 items. If asked to fix, fix those first.

## Complementary checks

- **First-click test:** would a new user's first click be toward the goal?
- **Five-second test:** what does the screen communicate in 5 seconds?
- **Accessibility quick pass:** keyboard nav, focus visible, contrast, labels, alt text, `aria-*`.
- **Mobile/responsive:** touch targets ≥ 44px, no horizontal scroll, reachable actions.

Be specific and terse. A finding without a location and a fix is noise.
