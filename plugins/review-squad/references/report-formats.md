# Report Formats

Use these formats when consolidating Review Squad findings. Keep reports
deduplicated, source-attributed, and ordered by impact.

## Experts

```markdown
## Review Squad: Experts - [Project]

Status: complete
Mode: read-only audit
Scope: [directories/files reviewed]
Browser: [URL / not provided / not verified]

### Squad Results

| Lane | Reviewer | Effort | Status | Headline |
| --- | --- | --- | --- | --- |

### Critical

| # | Finding | Evidence | Source Lanes | Suggested Fix |
| --- | --- | --- | --- | --- |

### Important

| # | Finding | Evidence | Source Lanes | Suggested Fix |
| --- | --- | --- | --- | --- |

### Minor

| # | Finding | Evidence | Source Lanes | Suggested Fix |
| --- | --- | --- | --- | --- |

### Deferred Or Not Verified

| Item | Source Lanes | Reason |
| --- | --- | --- |

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

| Issue | Senior Dev | PM | Student | Business Owner | Retired Teacher | Grandparent |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |

### Recommendations

| Priority | Issue | Who Was Confused | Suggested Fix |
| --- | --- | --- | --- |

### What Worked

- ...
```

Severity comes from reach: 5-6 personas is critical, 3-4 is important, 1-2 is
minor unless the issue blocks the main goal.

## Regulars

```markdown
## Regulars Review: [Site]

### Scorecard

| # | Task | Persona | Result | Issues |
| --- | --- | --- | --- | --- |

### Result

[N]/[Total] pass, [N] partial, [N] fail.

### Blockers

| Task | What Broke | Severity |
| --- | --- | --- |

### Friction

| Task | What Was Frustrating |
| --- | --- |

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

| Issue | Who Complained | Practical Fix |
| --- | --- | --- |

### Practical Fixlist

| # | Fix | Effort | Files Or Screens |
| --- | --- | --- | --- |
```

Keep the persona voice in the roast section and remove the theatrics from the
fixlist.
