---
name: regulars
description: Run sequential browser-based task-completion reviews by realistic users trying key flows.
---

# Regulars

Use this skill to verify whether real users can complete important site flows:
signup, checkout, search, subscribe, contact, pricing, docs, account, and
similar task paths.

This is not a source-code QA pass. Regulars must not read source code or project
files. They navigate like users and report task outcomes. Writing the paired
report artifacts under `.review-squad/reports/` is required and is still
considered part of the review.

## References

- `../../references/panels.md` for task examples.
- `../../references/browser-preflight.md` for browser availability and fallback.
- `../../references/report-formats.md` for scorecards and report artifacts.

## Workflow

1. Get the target URL.
2. Identify key user flows from the user's request. If flows are not specified,
   use the site's visible navigation after browser preflight, or ask the user
   for the flows that matter most.
3. Run browser preflight. If Playwright MCP is unavailable, stop and explain
   that task completion needs browser access. Offer to draft the task panel
   while waiting for browser access.
4. Present a task panel with personas, goals, and one unhappy path per task.
5. Ask the user to approve or customize the panel.
6. Run tasks sequentially because the browser session is shared.
7. After each task, report `PASS`, `PARTIAL`, or `FAIL` plus the headline issue.
8. Consolidate into a scorecard with blockers and friction.
9. Write paired report artifacts using the artifact contract in
   `report-formats.md`: `.review-squad/reports/<stem>.md` and
   `.review-squad/reports/<stem>.json`.
10. Present the Markdown findings in chat and include the JSON artifact path.

## Task Panel Format

```markdown
| # | Persona | Goal | Unhappy Path |
| --- | --- | --- | --- |
| 1 | [Name and context] | [Specific task] | [Invalid input, empty state, back button, etc.] |
```

Keep tasks concrete. "Browse the site" is not a task. "Find pricing and start a
trial" is a task.

## Persona Prompt Template

```text
You are [NAME], a [DESCRIPTION].
[One or two sentences about how you browse.]
You came to this site to: [SPECIFIC GOAL]

Do not read source code or project files. You are a real user.
Use browser MCP tools to navigate: [URL]
[For mobile personas: set viewport to 375x812 first.]

Task:
1. Open the URL and take a screenshot.
2. Try to accomplish the goal naturally.
3. Click, search, scroll, or go back as a real user would.
4. Take screenshots at major steps.
5. Test this unhappy path: [EDGE CASE].
6. Stop when you complete the goal or give up.

Report as [NAME]:
- Goal
- Result: PASS / PARTIAL / FAIL
- Steps Taken
- Where It Broke
- Frustrations
- Time to Complete
- Would I Come Back?
```

## Consolidation

Use the `Regulars` format from `report-formats.md`.

Blockers are failed tasks. Treat a failed primary conversion flow as critical.
Passed-but-painful flows go under friction.

Always write the paired Markdown and JSON artifacts before the final response.
The JSON artifact must conform to `review-report.schema.json`, include
`schema_version: "1.1"`, `findings: []`, `not_verified: []`,
`decision_summary`, stable `review_context` fields, and `mode_data.type:
"regulars"`. Findings must include structured impact, human gate summary,
workflow flags, decision flags, and evidence detail using the schema fields.
