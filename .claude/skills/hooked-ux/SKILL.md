---
name: hooked-ux
description: Design engagement and habit-forming product loops using Nir Eyal's Hook Model (Trigger → Action → Variable Reward → Investment). Use when designing notifications, onboarding, retention features, streaks, feeds, gamification, or "how do we get users to come back". Includes the ethical "manipulation matrix" check. Trigger on "increase engagement/retention", "habit loop", "notification strategy", "make users come back".
---

You design product loops with Nir Eyal's **Hook Model**. Every habit-forming feature cycles through four phases. Design all four explicitly — a loop with a weak link doesn't form a habit.

## The four phases

**1. Trigger** — what starts the loop.
- *External triggers:* notifications, emails, app icons, buttons, other people. Each should point to one obvious next action. Categorize: paid, earned (PR/virality), relationship (one user invites another), owned (the user opted in — push, newsletter, account).
- *Internal triggers:* an emotion, situation, or routine that prompts the user without a prompt. Usually a negative emotion (boredom, loneliness, FOMO, uncertainty, fear of missing a deadline). The goal of a hook is to attach your product to an internal trigger so users come unprompted. Ask: "What pain/itch does the user feel right before they'd use this?"

**2. Action** — the simplest behavior done in anticipation of a reward (B = MAT: Behavior happens when Motivation, Ability, and Trigger converge).
- Motivation: seek pleasure/avoid pain, seek hope/avoid fear, seek acceptance/avoid rejection.
- Ability: reduce effort. The six factors: time, money, physical effort, brain cycles, social deviance, non-routineness. Find the scarcest one and cut it.
- Make the core action stupidly easy (one tap, one field, pre-filled defaults).

**3. Variable Reward** — relieves the itch, and the *variability* keeps it compelling. Three types:
- *Rewards of the Tribe* — social validation: likes, comments, replies, leaderboard, "X people viewed".
- *Rewards of the Hunt* — resources/information: a feed, search results, deals, new content, points/money.
- *Rewards of the Self* — mastery, completion, control: progress bars, levels, "inbox zero", unlocking, badges.
- Keep an element of unpredictability ("what will I find?"). Finite variability eventually bores; lean toward sustainable/infinite variability where possible. Preserve the user's sense of autonomy — coercion kills the reward.

**4. Investment** — the user puts something *in*, which (a) increases the chance of the next pass through the loop and (b) makes the product better with use. Forms of stored value: content created, data, followers, reputation, skill learned, configured preferences. Crucially: ask for investment *after* the reward, not before. Investment loads the *next* trigger (e.g., you follow someone → their post becomes your next notification).

## Deliverable

For the feature in question, produce a one-page loop spec:
- Internal trigger (the emotion/situation)
- External trigger(s) and their type
- The minimum action + which ability factor you're reducing
- Reward type(s) and where the variability lives
- The investment and which future trigger it loads
- The "habit zone" check: frequency × perceived utility — is this used often enough to become a habit?

## Ethics check (do this — don't skip it)

Run the **Manipulation Matrix**: Does the maker use the product themselves? Does it materially improve the user's life?
- Uses it + improves life → **Facilitator** (build it).
- Doesn't use it + improves life → **Peddler** (be skeptical — verify the benefit is real).
- Uses it + doesn't improve life → **Entertainer** (fine, but fragile).
- Doesn't use it + doesn't improve life → **Dealer** (don't build it).
If a loop relies on exploiting anxiety with no real payoff, say so and propose an alternative.
