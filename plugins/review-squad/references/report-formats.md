# Report Formats

Use these formats when consolidating Review Squad findings. Keep reports
deduplicated, source-attributed, ordered by impact, and readable in narrow
terminal/chat panes.

Avoid wide Markdown tables for final reports. Long paths and suggested fixes
wrap badly. Prefer compact headings, bullets, and short "finding cards".

## Experts

```markdown
## Review Squad: Experts - [Project]

Status: complete
Mode: read-only audit
Scope: [directories/files reviewed]
Browser: [URL / not provided / not verified]

### Squad Results

- `SEC` Security Reviewer, high, complete: [headline]
- `API` API Design Reviewer, medium, complete: [headline]
- `DATA` Data Model Reviewer, medium, complete: [headline]

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
```

Keep the persona voice in the roast section and remove the theatrics from the
fixlist.
