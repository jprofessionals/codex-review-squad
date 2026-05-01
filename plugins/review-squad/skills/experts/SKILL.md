---
name: experts
description: Run a production-ready multi-perspective project audit with Codex subagents, project-type detection, user-approved expert panels, and a consolidated severity-ranked report.
---

# Experts

Use this skill for pre-launch review, post-refactor review, inherited codebase
assessment, or periodic project health checks.

This is a read-only review workflow. Do not edit files during the review. After
the report, offer to create an implementation plan before making fixes.

This skill must work standalone. Do not depend on other plugins or skills. If a
plan is needed after the report, write the plan directly in the current session.

## References

Load only what you need:

- `../../references/panels.md` for project detection and default panels.
- `../../references/browser-preflight.md` if a running URL is involved.
- `../../references/report-formats.md` for consolidation.

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
7. Offer to turn the findings into an implementation plan. Do not start edits
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

### Suggested Expert Panel

| Lane | Expert | Effort | Scope | Why this reviewer matters |
| --- | --- | --- | --- | --- |
| SEC | Security Reviewer | high | auth, secrets, trust boundaries | [reason] |
| API | API Design Reviewer | medium | routes, contracts, errors | [reason] |

### Optional Lanes

| Lane | Expert | Effort | Why add it |
| --- | --- | --- | --- |

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

If the runtime limits the number of parallel subagents, dispatch reviewers in
waves. Keep the approved panel intact, report which reviewers are running in
each wave, and never let waiting reviewers edit files.

Before dispatching, show:

```markdown
## Review Squad: Dispatch

Approved lanes: [count]
Runtime parallelism: [parallel limit if known, otherwise "runtime-managed"]

| Wave | Lanes | Notes |
| --- | --- | --- |
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

Findings must include:

- Severity
- Concrete issue
- Evidence
- Which reviewer found it
- Suggested fix

Order by launch risk: critical security/data/availability issues first, then
user-facing breakage, then SEO/a11y/performance, then polish.

After the report, ask whether the user wants an implementation plan. A good plan
groups fixes by dependency and risk, with critical items first.
