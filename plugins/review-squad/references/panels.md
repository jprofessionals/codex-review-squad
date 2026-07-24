# Review profiles

Use `review-catalog.json` for project detection and expert lanes. This reference
contains only human-review profiles and access constraints.

For deterministic project detection, derive `PLUGIN_ROOT` from this loaded
reference's absolute `references/` directory and run
`node "$PLUGIN_ROOT/scripts/runtime/review-runtime.mjs" detect <files.json>`. The input
is a JSON array of repository-relative paths. Never invoke a detector from the
reviewed target.

## Normies: first-impression jobs

Start with three distinct jobs; add more only when audience evidence or an
uncovered risk justifies them.

1. `DECIDE` — Evaluates whether the product is relevant.
   - Domain knowledge: moderate
   - Device/access: desktop, time constrained
   - Goal: understand audience, value, and next step
   - Success: summarize the offer and choose a clear action
2. `VERIFY` — Looks for proof before committing.
   - Domain knowledge: low
   - Device/access: mobile, zoomed text
   - Goal: find pricing, trust evidence, and constraints
   - Success: explain cost/credibility or identify what is missing
3. `ADOPT` — Assesses practical onboarding.
   - Domain knowledge: high
   - Device/access: desktop, keyboard navigation
   - Goal: find docs, integration, or setup guidance
   - Success: identify a credible path to first use

Each persona prompt must state job, domain knowledge, device/access constraints,
goal, success criteria, allowed access, and stop condition. Do not use age,
gender, or stereotypes as a proxy for behavior.

## Regulars: task jobs

Choose concrete jobs visible in the user request or target navigation:

- evaluate pricing and begin a trial
- find documentation for one integration
- search for a specific item and inspect its details
- prepare a signup, checkout, contact, subscription, upload, or account change
- recover from invalid input, empty results, back navigation, or interruption

Specify one success criterion and one unhappy path per task. Browser mutation
boundaries are defined in `browser-preflight.md` and the regulars skill.

## Well-actually: polish jobs

- `TYPE`: rendered typography and CSS
- `COPY`: rendered text and metadata
- `STANDARDS`: rendered DOM and templates
- `TECH`: source and public technical choices
- `PIXEL`: rendered layout, DOM, and CSS
- `UX`: rendered interaction and navigation

Give each reviewer only the access needed by its job. Browser-only profiles do
not read source. Source-aware profiles do not claim rendered behavior without a
browser observation.
