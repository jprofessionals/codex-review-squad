# Report Formats

Use these formats when consolidating Review Squad findings. Keep reports
deduplicated, source-attributed, ordered by impact, and readable in narrow
terminal/chat panes.

Avoid wide Markdown tables for final reports. Long paths and suggested fixes
wrap badly. Prefer compact headings, bullets, and short "finding cards".

Every completed Review Squad run writes paired report artifacts as part of the
review. The chat response remains a concise Markdown report for the human, and
the artifact files contain the full Markdown report plus the structured JSON
report.

## Artifact Contract

Write both files under the target repository's report directory:

```text
.review-squad/reports/<stem>.md
.review-squad/reports/<stem>.json
```

Use the same filename stem for both artifacts:

```text
<timestamp>-<mode>[-<label>...]
```

Rules:

- `timestamp` uses compact UTC form: `YYYYMMDDTHHMMSSZ`.
- `mode` is one of `experts`, `normies`, `regulars`, or `well-actually`.
- Optional labels identify what was reviewed, such as `story-1.15`, `pr-10`,
  `origin-main`, or a sanitized branch name.
- Labels must be filename-safe: `A-Z`, `a-z`, `0-9`, `.`, `_`, and `-` only.
- Derive labels from explicit user context first, then obvious repository
  context such as current branch, base branch, PR number, story id, or URL host.
- Omit labels that cannot be determined confidently.
- Create `.review-squad/reports/` if it does not already exist.

Example:

```text
.review-squad/reports/20260502T083200Z-experts-story-1.15-pr-10-origin-main.md
.review-squad/reports/20260502T083200Z-experts-story-1.15-pr-10-origin-main.json
```

The final chat response should include the Markdown findings and the JSON
artifact path. Mention the Markdown artifact path when useful, but the JSON path
is required because downstream tooling usually needs it.

## JSON Report

The JSON artifact must conform to `review-report.schema.json` in this directory.
Use `schema_version: "1.0"` until that schema changes incompatibly.

Required conventions:

- Always emit `findings: []`, even when there are no findings.
- Always emit `not_verified: []`, even when everything was verified.
- Always emit `mode_data` matching the selected mode.
- Keep actionable severity separate from verification state. Finding severities
  are only `critical`, `important`, or `minor`; unverified checks belong in
  `not_verified[]`.
- Include `generator.name`, `generator.version`, and `generator.skill`.
- Include per-finding `remediation`: `patchable`, `needs_human`, `follow_up`,
  `informational`, or `not_verified`.
- Include per-finding decision flags: `adr_required`,
  `follow_up_story_required`, and `scope_decision_required`.
- Evidence line references may include `line` and `line_end`.
- Use valid JSON only: no comments and no Markdown fences in the artifact file.

## Markdown Reports

The Markdown artifact should use the same human-readable format shown in chat,
but may include more detail than the final response when the chat response is
kept concise.

## Experts

```markdown
## Review Squad: Experts - [Project]

Status: complete
Mode: read-only audit
Scope: [directories/files reviewed]
Browser: [URL / not provided / not verified]

### Squad Results

High priority:

- `SEC` Security Reviewer, high effort, complete: [headline]
- `DATA` Data Model Reviewer, high effort, complete: [headline]

Standard priority:

- `API` API Design Reviewer, medium effort, complete: [headline]

### Critical

`C-01` [Source lanes] [Finding title]

- Evidence: [file:line or URL]
- Impact: [why this blocks launch or creates serious risk]
- Suggested fix: [concise action]

If there are no critical findings, write: `No critical findings reported.`

### Important

`I-01` [Source lanes] [Finding title]

- Evidence: [file:line or URL]
- Impact: [user, security, reliability, delivery, or maintainability impact]
- Suggested fix: [concise action]

### Minor

`M-01` [Source lanes] [Finding title]

- Evidence: [file:line or URL]
- Suggested fix: [concise action]

### Deferred Or Not Verified

`D-01` [Source lanes] [Item]

- Reason: [what could not be verified and why]
- Follow-up: [what would verify it]

### Recommended Next Move

[One concise recommendation: proceed, harden first, or create a cleanup story.]

### Report Artifacts

- Markdown: `.review-squad/reports/<stem>.md`
- JSON: `.review-squad/reports/<stem>.json`

### Implementation Plan Offer

Ask whether to turn the findings into an implementation plan before editing.
```

Severity guidance:

- Critical: user data risk, security hole, broken launch flow, compliance block
- Important: likely user impact, SEO/a11y/performance regression, reliability gap
- Minor: polish, maintainability, edge cases, non-blocking improvements

## Normies

```markdown
## Normies Review: [Site]

### Confusion Matrix

Use issue cards instead of a wide matrix:

`N-01` [Issue]

- Affected personas: [Senior Dev, PM, Student, ...]
- Severity: [critical/important/minor]
- Evidence: [screenshots or observed moments]
- Suggested fix: [concise action]

### Recommendations

1. [Issue]: [fix], affecting [personas].
2. [Issue]: [fix], affecting [personas].

### What Worked

- ...

### Report Artifacts

- Markdown: `.review-squad/reports/<stem>.md`
- JSON: `.review-squad/reports/<stem>.json`
```

Severity comes from reach: 5-6 personas is critical, 3-4 is important, 1-2 is
minor unless the issue blocks the main goal.

## Regulars

```markdown
## Regulars Review: [Site]

### Scorecard

- `PASS` [Task] - [Persona]: [headline]
- `PARTIAL` [Task] - [Persona]: [headline]
- `FAIL` [Task] - [Persona]: [headline]

### Result

[N]/[Total] pass, [N] partial, [N] fail.

### Blockers

`R-01` [Task]

- Result: FAIL
- What broke: [exact moment]
- Severity: [critical/important/minor]
- Suggested fix: [concise action]

### Friction

- [Task]: [what was frustrating]

### What Worked

- ...

### Report Artifacts

- Markdown: `.review-squad/reports/<stem>.md`
- JSON: `.review-squad/reports/<stem>.json`
```

Use `PASS`, `PARTIAL`, or `FAIL`.

## Well Actually

```markdown
## Well, Actually: [Site Or Project]

### The Roast

#### [Persona]

[In-character findings]

### Cross-Persona Consensus

`W-01` [Issue]

- Who complained: [personas]
- Practical fix: [concise action]

### Practical Fixlist

1. [Fix] - [effort] - [files/screens]
2. [Fix] - [effort] - [files/screens]

### Report Artifacts

- Markdown: `.review-squad/reports/<stem>.md`
- JSON: `.review-squad/reports/<stem>.json`
```

Keep the persona voice in the roast section and remove the theatrics from the
fixlist.
