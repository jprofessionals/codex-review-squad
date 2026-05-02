---
name: experts
description: Run a production-ready multi-perspective project audit with Codex subagents, project-type detection, user-approved expert panels, and a consolidated severity-ranked report.
---

# Experts

Use this skill for pre-launch review, post-refactor review, inherited codebase
assessment, or periodic project health checks.

This is a read-only source review workflow. Do not edit project source files
during the review. Writing the paired report artifacts under
`.review-squad/reports/` is required and is still considered part of the review.
After the report, offer to create an implementation plan before making fixes.

This skill must work standalone. Do not depend on other plugins or skills. If a
plan is needed after the report, write the plan directly in the current session.

## References

Load only what you need:

- `../../references/panels.md` for project detection and default panels.
- `../../references/browser-preflight.md` if a running URL is involved.
- `../../references/report-formats.md` for consolidation and report artifacts.

## Workflow

1. Inspect the repository with fast read-only commands (`rg --files`, manifest
   reads, config reads, targeted source reads). Identify project type, stack,
   likely user-facing surface, and important directories.
2. If the user provided a URL, run browser preflight. If browser MCP is missing,
   continue code review and mark rendered checks as not verified.
3. Propose a default expert panel based on the detected project type. Include
   4-8 reviewers by default and suggest stack-specific additions or removals.
   Use the panel proposal format below so the review feels like a coordinated
   squad, not a loose list of agents.
4. Ask the user to approve or customize the panel before dispatching reviewers.
5. Dispatch approved reviewers in parallel using Codex subagents when available.
   If subagents are unavailable, state the limitation and run the reviews
   sequentially in the current agent.
6. Consolidate findings into one deduplicated, severity-ranked report with
   source attribution.
7. Write paired report artifacts using the artifact contract in
   `report-formats.md`: `.review-squad/reports/<stem>.md` and
   `.review-squad/reports/<stem>.json`.
8. Present the Markdown findings in chat, include the JSON artifact path, and
   offer to turn the findings into an implementation plan. Do not start edits
   until the user asks for implementation.

## Panel Proposal

Show the proposal in this format:

```markdown
## Review Squad: Experts

Status: panel proposal
Target: [project name]
Detected project: [type]
Stack: [stack]
Scope: [important directories/files]
Browser: [URL / not provided / unavailable]
Mode: read-only audit

### High Priority Lanes

`SEC` Security Reviewer

- Scope: auth, secrets, trust boundaries
- Why: [reason]
- Effort: high

`DATA` Data Model Reviewer

- Scope: schema, migrations, constraints
- Why: [reason]
- Effort: high

### Standard Priority Lanes

`API` API Design Reviewer

- Scope: routes, contracts, errors
- Why: [reason]
- Effort: medium

### Candidate Lanes

`OBS` Observability Reviewer

- Why add it: [reason]
- Effort: medium

### Approval

Reply `approve` to dispatch this panel, or tell me what to add, remove, rename,
or reprioritize.
```

## Reviewer Prompt Template

Each subagent prompt must be concrete and bounded:

```text
You are the [LANE] lane: [ROLE] reviewing a [PROJECT TYPE] project.

This is a read-only review. Do not edit files, do not run code-modifying
commands, do not reformat files, and do not revert any changes.

Project path: [ABSOLUTE PATH]
Stack: [STACK SUMMARY]
Important directories/files: [DIRECTORY HINTS]
Running URL, if available: [URL OR "none"]
Browser status: [available/unavailable/not checked]
Assigned effort: [low/medium/high]

Review focus:
1. [Specific area and where to inspect]
2. [Specific area and where to inspect]
...
8. [Specific area and where to inspect]

Return findings only. Rank each finding as CRITICAL, IMPORTANT, MINOR, or
NOT VERIFIED. Include evidence with file paths, line numbers when available,
screens or URLs when browser evidence exists, and a concise suggested fix.
Do not include generic best practices unless they are tied to project evidence.
Do not use wide Markdown tables; use short bullets or finding cards.

Start your report with:
Lane: [LANE]
Reviewer: [ROLE]
Headline: [one sentence]
```

## Dispatch Guidance

Use parallel Codex subagents for independent reviewers. Assign each reviewer a
single responsibility. Reviewers may read overlapping files, but none may write.
Give every reviewer a short lane ID, usually 3-5 uppercase letters, such as
`SEC`, `API`, `DATA`, `REL`, `ARCH`, `TEST`, `A11Y`, `PERF`, `COPY`, or `OBS`.

Set subagent reasoning effort intentionally:

- Use `reasoning_effort: medium` by default for expert reviewers.
- Use `reasoning_effort: high` only for security, reliability, architecture,
  data integrity, complex performance, or unusually large/ambiguous codebases.
- Use `reasoning_effort: low` for narrow copy, social metadata, basic SEO, or
  other quick checklist reviewers when latency matters.

In panel proposals, group lanes by review priority before dispatch:

- `High Priority Lanes`: highest relevance to the user's goal or highest risk.
- `Standard Priority Lanes`: still useful, but less central or lower risk.
- `Candidate Lanes`: optional additions for the user to approve.

Do not put priority and effort on the same line. The group communicates
priority; the lane card's `Effort:` bullet communicates subagent reasoning
effort.

If the runtime limits the number of parallel subagents, dispatch reviewers in
waves. Keep the approved panel intact, report which reviewers are running in
each wave, and never let waiting reviewers edit files.

Before dispatching, show:

```markdown
## Review Squad: Dispatch

Approved lanes: [count]
Runtime parallelism: [parallel limit if known, otherwise "runtime-managed"]

Wave 1: [LANE, LANE, LANE]
- Priority: high
- Notes: [why these lanes run first]

Wave 2: [LANE, LANE]
- Priority: standard
- Notes: [queued because of runtime parallelism]
```

While reviewers run, give short progress updates:

```markdown
Progress: [LANE] complete - [headline finding or "no major issue"]
Waiting: [LANE, LANE]
Running: [LANE, LANE]
```

When reviewers finish, skim for duplicates and conflicts. If two reviewers flag
the same root cause, merge it into one consolidated row and list both sources.
If a reviewer could not verify browser behavior, preserve that as `NOT VERIFIED`
instead of silently dropping it.

## Consolidation Rules

Use the `Experts` format from `report-formats.md`.

Do not use wide Markdown tables in the final report. Use finding cards:

```markdown
`I-01` [SEC, REL] Short finding title

- Evidence: path/to/file.kt:123; path/to/other.kt:45
- Impact: one concise sentence
- Suggested fix: one concise sentence
```

Findings must include:

- Severity
- Concrete issue
- Evidence
- Which reviewer found it
- Suggested fix
- Remediation classification
- Decision flags

Order by launch risk: critical security/data/availability issues first, then
user-facing breakage, then SEO/a11y/performance, then polish.

Always write the paired Markdown and JSON artifacts before the final response.
The JSON artifact must conform to `review-report.schema.json`, include
`findings: []` and `not_verified: []` when empty, and include `mode_data.type:
"experts"`.

After the report, ask whether the user wants an implementation plan. A good plan
groups fixes by dependency and risk, with critical items first.
