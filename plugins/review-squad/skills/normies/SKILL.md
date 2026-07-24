---
name: normies
description: Run sequential browser-based first-impression reviews by personas with different levels of technical sophistication.
---

# Normies

Use this skill to answer: "Do first-time visitors understand this site?"
Normies are cold visitors of the rendered site only: never read source or
project files.

## References

- `../../references/panels.md` for personas.
- `../../references/review-catalog.json` for mode and severity.
- `../../references/dispatch-policy.md` for panel approval.
- `../../references/browser-preflight.md` for browser, isolation, and fallback.
- `../../references/report-formats.md` for JSON and Markdown.

## Workflow

1. Get the target URL; ask for it or offer the in-scope local server if absent.
2. Run browser preflight. If it fails, stop and offer only user-provided
   screenshots or a browser transcript.
3. Start with `DECIDE`, `VERIFY`, and `ADOPT` from `panels.md`; add a profile
   only for concrete audience evidence or uncovered risk.
4. Apply `dispatch-policy.md`.
5. For each persona, use the preflight isolation contract: fresh reasoning
   context, fresh isolated browser session, then close and verify it before the
   next persona. If this fails, stop or explicitly downgrade the cold claim.
6. Briefly report each impression, consolidate a confusion matrix, then author,
   validate, and render schema-2.0 JSON. Use `inline_only` without an approved
   writable root.

## Persona prompt

```text
Job: [DECIDE / VERIFY / ADOPT / justified custom job]
Knowledge: [low / moderate / high]
Device/access: [explicit]
Goal and success criteria: [observable]
You have not seen this site or prior findings.

Do not read source or project files. Visit: [URL]
Viewport: [WIDTHxHEIGHT]
Isolation: fresh reasoning and isolated session; no inherited cookies, storage,
cache, permissions, navigation, viewport, or findings.

1. Screenshot first load.
2. Within [TIME LIMIT], say what this site is about.
3. Find [persona-relevant thing], navigating naturally.
4. Screenshot major moments; note confusion, hesitation, jargon, and give-up.

Report: first impression; understanding; confusion; give-up; missing items;
unknown words; what worked.
```

Use catalog severity: goal blockage, breadth, recoverability, risk, confidence,
and evidence. Persona count supports breadth but never determines severity.
Keep recommendations about clarity, hierarchy, trust, language, navigation, and
obvious next actions. Author canonical JSON only; the renderer produces Markdown.
