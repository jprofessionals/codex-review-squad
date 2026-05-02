---
name: normies
description: Run sequential browser-based first-impression reviews by personas with different levels of technical sophistication.
---

# Normies

Use this skill to answer: "Do first-time visitors understand this site?"

This is not a code review. Normies must not read source code or project files.
They are cold visitors using the rendered site only. Writing the paired report
artifacts under `.review-squad/reports/` is required and is still considered
part of the review.

## References

- `../../references/panels.md` for persona defaults.
- `../../references/browser-preflight.md` for browser availability and fallback.
- `../../references/report-formats.md` for the confusion matrix and report
  artifacts.

## Workflow

1. Get the target URL. If none is provided, ask for it or offer to start the
   local dev server when appropriate.
2. Run browser preflight. If Playwright MCP is unavailable, stop and explain
   that cold visitor review needs browser access. Offer to proceed only from
   screenshots or a browser transcript supplied by the user.
3. Present the default persona panel and suggest audience-specific additions.
4. Ask the user to approve or customize the panel.
5. Run personas sequentially because the browser session is shared.
6. After each persona, briefly report the key impression.
7. Consolidate into a confusion matrix and prioritized recommendations.
8. Write paired report artifacts using the artifact contract in
   `report-formats.md`: `.review-squad/reports/<stem>.md` and
   `.review-squad/reports/<stem>.json`.
9. Present the Markdown findings in chat and include the JSON artifact path.

## Default Personas

Use 4-6 personas unless the user requests more:

- Senior developer: expert, impatient, skeptical of vague claims.
- Product manager: goal-oriented, wants value and audience fit quickly.
- College student: visual scanner, low patience, mobile-first habits.
- Small business owner: practical, busy, wants pricing/contact/proof.
- Retired teacher: careful reader, lower technical vocabulary.
- Grandparent: minimal web assumptions, easily blocked by icons or jargon.

## Persona Prompt Template

```text
You are [NAME], a [AGE]-year-old [DESCRIPTION].
[Two sentences about browsing behavior and patience.]
You have never seen this site before and know nothing about it.

Do not read source code or project files. You are a visitor, not a developer.
Use browser MCP tools to visit: [URL]

Your experience:
1. Open the URL and take a screenshot.
2. In the first [TIME LIMIT], answer: What is this site about?
3. Try to find [persona-relevant thing].
4. Navigate naturally. Take screenshots at major moments.
5. Note every moment of confusion, hesitation, or jargon.
6. Stop when you would give up in real life.

Report in character:
- First Impression
- What I Think This Site Is About
- Where I Got Confused
- Where I Gave Up
- What I Could Not Find
- Words I Did Not Understand
- What I Liked
```

## Consolidation

Use the `Normies` format from `report-formats.md`.

Severity comes from breadth:

- 5-6 personas affected: critical
- 3-4 personas affected: important
- 1-2 personas affected: minor unless it blocks the primary call to action

Do not convert this into a technical audit. Recommendations should focus on
clarity, language, navigation, hierarchy, trust, and obvious next actions.

Always write the paired Markdown and JSON artifacts before the final response.
The JSON artifact must conform to `review-report.schema.json`, include
`findings: []` and `not_verified: []` when empty, and include `mode_data.type:
"normies"`.
