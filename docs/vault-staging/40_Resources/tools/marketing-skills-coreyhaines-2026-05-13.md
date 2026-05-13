---
title: "Marketing Skills (coreyhaines31/marketingskills) installiert"
created: 2026-05-13
tags: [propus, tools, claude-code, marketing]
status: active
repo: "propus-platform"
commit: "afe38ec"
---

# Marketing Skills im propus-platform Repo

Installation via:

```bash
npx skills add coreyhaines31/marketingskills
```

41 Skills landen unter `.agents/skills/`, Symlinks unter `.claude/skills/`,
sodass Claude Code sie automatisch erkennt. Quelle:
https://github.com/coreyhaines31/marketingskills

PR: https://github.com/Janez76/propus-platform/pull/498
Commit: `afe38ec`

## Skill-Kategorien

| Bereich | Skills |
|---|---|
| **SEO / Discovery** | seo-audit, ai-seo, programmatic-seo, schema-markup, site-architecture, aso-audit, directory-submissions |
| **CRO** | page-cro, signup-flow-cro, onboarding-cro, form-cro, popup-cro, paywall-upgrade-cro |
| **Copy & Content** | copywriting, copy-editing, content-strategy, social-content, ad-creative, image, video |
| **Lifecycle / Email** | email-sequence, cold-email, churn-prevention |
| **Strategy & GTM** | launch-strategy, pricing-strategy, marketing-ideas, marketing-psychology, customer-research, competitor-profiling, competitor-alternatives, product-marketing-context |
| **Acquisition** | paid-ads, lead-magnets, free-tool-strategy, referral-program, co-marketing, community-marketing |
| **Ops** | revops, sales-enablement, analytics-tracking, ab-test-setup |

## Verwendung

Skills werden in Claude-Sessions im propus-platform Repo automatisch über
`SKILL.md`-Frontmatter getriggert. Beispiel-Trigger:

- "seo-audit für /admin/tours" → `seo-audit`
- "schreib mir cold emails für Selekto-Leads" → `cold-email`
- "preismodell für Selekto checken" → `pricing-strategy`
- "landing page für Buchungsportal optimieren" → `page-cro`

Jeder Skill hat unter `references/` Templates, Frameworks und Benchmarks
(z. B. `cold-email/references/subject-lines.md`,
`paid-ads/references/audience-targeting.md`).

## Updates

Updaten der Skill-Sammlung:

```bash
npx skills add coreyhaines31/marketingskills --force
```

## Mögliche Einsatzfelder bei Propus

- **Selekto-Wachstum:** `cold-email`, `lead-magnets`, `ab-test-setup`
- **Buchungsportal-CRO:** `signup-flow-cro`, `onboarding-cro`, `form-cro`
- **Tour-Manager B2B-Akquise:** `competitor-profiling`, `sales-enablement`,
  `pricing-strategy`
- **Content/SEO für Firmenhomepage:** `seo-audit`, `programmatic-seo`,
  `schema-markup`, `copywriting`

## Verwandte Notizen

- `[[claude-code-setup]]`
- `[[propus-marketing-stack]]`
