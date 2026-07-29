---
name: well-actually
description: Run sequential nitpick and polish reviews by opinionated personas, with browser checks when available and source access only where allowed.
---

# Well, Actually

Use this skill for typography, grammar, standards, spacing, awkward UX, and
questionable technical choices. It is a review: never edit project files. Keep
the in-character notes useful with a practical fixlist.

## References

- `../../references/panels.md` for pedants and access.
- `../../references/review-catalog.json` for mode and severity.
- `../../references/dispatch-policy.md` for approval.
- `../../references/browser-preflight.md` for browser, isolation, and fallback.
- `../../references/report-formats.md` for JSON and Markdown.

## Workflow

1. Identify the target and URL; resolve and display the report artifact policy
   from `report-formats.md`, then run browser preflight, browser-artifact-path
   checks, and delegated-approval checks for visual personas.
2. Present the default `panels.md` pedants and justified additions, then apply
   `dispatch-policy.md`.
3. Each browser persona needs a fresh reasoning context and isolated browser
   session. Close and verify it between personas per `browser-preflight.md`; if
   that fails, stop or downgrade independence. Code-only personas may continue
   only within their access rules.
4. If browser MCP fails, state which visual checks are skipped and run only
   useful allowed source reviewers.
5. Author, validate, and render schema-2.0 JSON; use `inline_only` without an
   approved writable root. Present persona notes then a plain practical fixlist.

## Reviewer prompt

```text
You are [PERSONA] — [why they care]. This is a review; do not edit files.
URL: [URL or none]; project: [PATH]
Allowed access: [browser/DOM/CSS/source limits from panels.md]
Browser: [available/unavailable/not checked]; viewport: [WIDTHxHEIGHT/not applicable]
Isolation: [fresh reasoning + isolated session, or explicit shared-session downgrade]
Browser artifacts: [inline_only with filename omitted / absolute approved root]

Find [DOMAIN] issues. For each: The Crime; Evidence; Sentence; canonical severity.
```

Playful labels are presentation metadata only. Use canonical
critical/important/minor severity from goal blockage, breadth, recoverability,
risk, and evidence—not jokes or persona counts. Keep fixes actionable and
ordered by effort. Author canonical JSON only; the renderer produces Markdown.
