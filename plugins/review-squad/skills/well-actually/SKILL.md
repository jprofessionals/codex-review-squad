---
name: well-actually
description: Run sequential nitpick and polish reviews by opinionated personas, with browser checks when available and source access only where allowed.
---

# Well, Actually

Use this skill when the user wants the nitpicks that professional audits often
skip: typography, grammar, standards, spacing, awkward UX, and questionable
technical choices.

This mode may be playful, but it must still be useful. Do not edit project
source files during the review. Writing the paired report artifacts under
`.review-squad/reports/` is required and is still considered part of the review.
Keep a practical fixlist after the in-character reports.

## References

- `../../references/panels.md` for default pedants and access rules.
- `../../references/browser-preflight.md` for browser availability and fallback.
- `../../references/report-formats.md` for the roast, fixlist format, and
  report artifacts.

## Workflow

1. Identify the target site/project and URL if available.
2. Run browser preflight for visual/browser personas.
3. Present the default pedant panel and suggest project-specific additions.
4. Ask the user to approve or customize the panel.
5. Run browser-using personas sequentially. Code-only personas may run without a
   browser if their access rules allow it.
6. If browser MCP is unavailable, say which visual checks are skipped. Run only
   useful source-access reviewers, such as standards or tech-choice reviewers,
   when the user still wants a partial review.
7. Write paired report artifacts using the artifact contract in
   `report-formats.md`: `.review-squad/reports/<stem>.md` and
   `.review-squad/reports/<stem>.json`.
8. Present in-character findings first, then a practical fixlist, and include
   the JSON artifact path.

## Default Panel

- Typographer: rendered typography and CSS only.
- Grammarian: rendered text only.
- Standards zealot: rendered DOM and templates only.
- Hacker News commenter: rendered site and source code.
- Pixel cop: rendered site, DOM, and CSS only.
- UX reply guy: rendered site only.

## Reviewer Prompt Template

```text
You are [PERSONA] -- [one-line personality].
[Two sentences explaining why this person cares too much about this topic.]

This is a review only. Do not edit files.
Target URL: [URL OR "none"]
Project path: [PATH]
Allowed access: [browser/DOM/CSS/source limits from panels.md]
Browser status: [available/unavailable/not checked]

Mission: find [DOMAIN] issues that a normal reviewer might skip.

Look for:
1. [Specific thing and where to check]
2. [Specific thing and where to check]
...
10. [Specific thing and where to check]

Report in character. For each issue include:
- The Crime
- The Evidence
- The Sentence
- Severity
```

Use persona-specific severity scales:

- Typographer: Unforgivable / Deeply Troubling / Disappointing
- Grammarian: 1-5 Red Pens
- Standards zealot: Spec Violation / Accessibility Failure / Best Practice Breach
- Hacker News commenter: fake upvote count, plus practical note
- Pixel cop: Pixel Crime / Misdemeanor / Infraction
- UX reply guy: Unusable / Annoying / Suboptimal

## Consolidation

Use the `Well Actually` format from `report-formats.md`.

The first section can keep the persona voice. The practical fixlist must be
plain, actionable, and ordered by effort. Do not let jokes obscure whether a fix
is worth doing.

Always write the paired Markdown and JSON artifacts before the final response.
The JSON artifact must conform to `review-report.schema.json`, include
`schema_version: "1.1"`, `findings: []`, `not_verified: []`,
`decision_summary`, stable `review_context` fields, and `mode_data.type:
"well-actually"`. Findings must include structured impact, human gate summary,
workflow flags, decision flags, and evidence detail using the schema fields.
