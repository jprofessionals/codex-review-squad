---
name: experts
description: Run a production-ready multi-perspective project audit with Codex subagents, project-type detection, user-approved expert panels, and a consolidated severity-ranked report.
---

# Experts

Use this skill for pre-launch review, post-refactor review, inherited codebase
assessment, or periodic project health checks.

This is a read-only review workflow. Do not edit files during the review. After
the report, offer to create an implementation plan before making fixes.

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
4. Ask the user to approve or customize the panel before dispatching reviewers.
5. Dispatch approved reviewers in parallel using Codex subagents when available.
   If subagents are unavailable, state the limitation and run the reviews
   sequentially in the current agent.
6. Consolidate findings into one deduplicated, severity-ranked report with
   source attribution.
7. Offer to turn the findings into an implementation plan. Do not start edits
   until the user asks for implementation.

## Panel Proposal

Show the proposal in this compact format:

```markdown
Detected project: [type], [stack], [important directories]

Suggested expert panel:
| Expert | Why this reviewer matters here |
| --- | --- |

Suggested optional additions:
- [Reviewer] because [reason]

Approve this panel, or tell me what to add/remove/change.
```

## Reviewer Prompt Template

Each subagent prompt must be concrete and bounded:

```text
You are a [ROLE] reviewing a [PROJECT TYPE] project.

This is a read-only review. Do not edit files, do not run code-modifying
commands, do not reformat files, and do not revert any changes.

Project path: [ABSOLUTE PATH]
Stack: [STACK SUMMARY]
Important directories/files: [DIRECTORY HINTS]
Running URL, if available: [URL OR "none"]
Browser status: [available/unavailable/not checked]

Review focus:
1. [Specific area and where to inspect]
2. [Specific area and where to inspect]
...
8. [Specific area and where to inspect]

Return findings only. Rank each finding as CRITICAL, IMPORTANT, MINOR, or
NOT VERIFIED. Include evidence with file paths, line numbers when available,
screens or URLs when browser evidence exists, and a concise suggested fix.
Do not include generic best practices unless they are tied to project evidence.
```

## Dispatch Guidance

Use parallel Codex subagents for independent reviewers. Assign each reviewer a
single responsibility. Reviewers may read overlapping files, but none may write.

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
