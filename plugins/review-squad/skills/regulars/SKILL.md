---
name: regulars
description: Run sequential browser-based task-completion reviews by realistic users trying key flows.
---

# Regulars

Use this skill to test whether users can complete important flows. Regulars use
the rendered site only: never read source or project files.

## References

- `../../references/panels.md` for task examples.
- `../../references/review-catalog.json` for severity.
- `../../references/dispatch-policy.md` for approval.
- `../../references/browser-preflight.md` for browser, isolation, and safety.
- `../../references/report-formats.md` for JSON and Markdown.

## Workflow

1. Get the URL and key flows. If unspecified, use visible navigation after
   preflight or ask which flows matter.
2. Resolve and display the report artifact policy from `report-formats.md`, then
   run browser preflight, including browser-artifact-path and delegated-approval checks.
   If unavailable, stop and offer to draft the panel or use the explicitly
   limited snapshot-only fallback.
3. Make the safety-complete task panel below, then apply `dispatch-policy.md`.
4. Each persona needs a fresh reasoning context and isolated browser session.
   Close and verify it between personas as `browser-preflight.md` requires; if
   this is impossible, stop or downgrade the independence claim.
5. Report `PASS`, `PARTIAL`, or `FAIL`; consolidate blockers and friction.
6. Author, validate, and render schema-2.0 JSON. Use `inline_only` without an
   approved writable root.

## Task panel

| # | Job / device | Goal / success / unhappy path | Environment | Credential policy | Allowed mutations | Forbidden actions | Exact stop boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [knowledge; constraints] | [task; observable result; edge case] | [local/staging/sandbox/production] | [none/test account; never invent] | [navigate, screenshot, fill without submit] | [external writes] | [final button/action not crossed] |

Tasks must be concrete: “find pricing and start a trial,” not “browse.”

## Persona prompt

```text
Job/knowledge: [specific user job; low/moderate/high]
Device/access: [explicit]
Goal and success criteria: [observable]
Environment: [local / staging / sandbox / production]
Credential policy: [none / supplied test account; never create or infer]
Allowed mutations: [normally navigate, screenshot, snapshot, fill without submit]
Forbidden actions: [all external writes]
Exact stop boundary: Stop before [signup / purchase / send / subscribe / upload /
account save / other visible final action].

Do not read source or project files. Visit: [URL]
Viewport: [WIDTHxHEIGHT]
Isolation: fresh reasoning and isolated session; no prior state or findings.
Browser artifacts: [inline_only with filename omitted / absolute approved root]

1. Screenshot first load using no filename for inline output or an absolute
   filename under the supplied approved browser-artifact root, then try the goal
   naturally.
2. Click, search, scroll, or go back; test [EDGE CASE].
3. Screenshot major steps under the same artifact rule.
4. Stop at completion, give-up, or the boundary. Never cross it without explicit
   approval and a sandbox/test cleanup plan.

Report: goal; PASS/PARTIAL/FAIL; steps; breakage; friction; time; return intent.
```

Use catalog severity. A failed task is a blocker, not automatically critical;
passed-but-painful flows are friction. Author canonical JSON only; render Markdown.
