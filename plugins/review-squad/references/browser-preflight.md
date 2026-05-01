# Browser Preflight

Use this reference for `normies`, `regulars`, and `well-actually`, and for
`experts` when the user provides a running URL.

## Preconditions

1. Identify the target URL. Prefer an explicit user-provided URL. If missing,
   ask the user for the running site URL or ask whether you should start the
   local dev server when that is in scope.
2. Check whether Playwright MCP browser tools are available in the current
   Codex session. This plugin ships `.mcp.json` with:
   `npx @playwright/mcp@latest`.
3. If browser MCP is unavailable, say exactly what is missing. Do not pretend
   to browse, do not infer first impressions from source code, and do not run
   browser-persona reviews from code alone.
4. If the browser is available but the URL fails to load, report the load error
   and stop before dispatching personas unless the user provides another URL.

## Dispatch Rules

- Browser-using personas run sequentially because the browser session is shared.
- Normies and regulars must not read source code or project files.
- Experts are read-only reviewers: they may inspect source and rendered pages
  but must not edit files.
- Well-actually reviewers follow the per-persona access rules in `panels.md`.

## Graceful Degradation

If browser MCP is missing:

- `normies`: stop and explain that cold visitor review needs a browser. Offer
  to proceed only from user-provided screenshots or a live browser transcript.
- `regulars`: stop and explain that task completion requires a browser. Offer
  to help define the task panel while waiting for browser access.
- `well-actually`: run only code/source-access personas when useful, mark all
  visual/browser checks as skipped, and keep the practical fixlist honest.
- `experts`: continue code review when applicable, marking rendered-page checks
  as not verified.

## Persona Browser Prompt Requirements

Every browser persona prompt should include:

- The exact URL
- A no-source-code guard unless the persona is allowed to inspect source
- Screenshot checkpoints at first load and major steps
- A clear stop condition
- A report structure from `report-formats.md`
