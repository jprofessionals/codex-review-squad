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
2. Run browser preflight, including artifact-path and delegated-approval checks.
   If it fails, stop and offer only user-provided screenshots, a browser
   transcript, or the explicitly limited snapshot-only fallback.
3. Start with `DECIDE`, `VERIFY`, and `ADOPT` from `panels.md`; add a profile
   only for concrete audience evidence or uncovered risk.
4. Apply `dispatch-policy.md`.
5. For each persona, use a fresh reasoning context and browser session. Call
   `browser_get_config` and verify isolation, blocked service workers, and no
   persistent profile or storage-state input. Cookies may be checked before
   navigation; navigate to the approved controlled origin before probing local
   or session storage. The persona must call `browser_close`, receive a
   successful tool result, and include that result in its handoff.
6. Start a new isolated browser session for the next persona. Treat unavailable
   PID/process-tree identity as diagnostic only. Stop fail-closed on an explicit
   close failure, reused context, or observed state leak.
7. Briefly report each impression, consolidate a confusion matrix, then author,
   validate, and render schema-2.0 JSON. Set `mode_data.panel_status` to
   `complete`, `partial`, or `not_run`. Preserve completed persona findings;
   list every undispatched persona as `not_verified`, and distinguish a proven
   leak from missing observability. Use `inline_only` without an approved
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
Browser artifacts: [inline_only with filename omitted / absolute approved root]

1. Screenshot first load using no filename for inline output or an absolute
   filename under the supplied approved browser-artifact root.
2. Within [TIME LIMIT], say what this site is about.
3. Find [persona-relevant thing], navigating naturally.
4. Screenshot major moments under the same artifact rule; note confusion,
   hesitation, jargon, and give-up.
5. Call browser_close. Report whether its tool result succeeded; do not infer a
   PID or process-tree result that the runtime did not expose.

Report: first impression; understanding; confusion; give-up; missing items;
unknown words; what worked; browser_close result; isolation assurance.
```

Use catalog severity: goal blockage, breadth, recoverability, risk, confidence,
and evidence. Persona count supports breadth but never determines severity.
Keep recommendations about clarity, hierarchy, trust, language, navigation, and
obvious next actions. Author canonical JSON only; the renderer produces Markdown.
