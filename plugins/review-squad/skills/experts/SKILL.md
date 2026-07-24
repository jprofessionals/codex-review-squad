---
name: experts
description: Run a production-ready multi-perspective project audit with Codex subagents, multi-label project detection, risk-adaptive lane dispatch, and a canonical evidence-backed report.
---

# Experts

Run a read-only source review for launch readiness, refactors, inherited systems,
or periodic health checks. Do not edit project files. Report artifacts are the
only review writes. Offer an implementation plan after reporting; do not fix
findings without a new user request.

## References

Load only what applies:

- `../../references/review-catalog.json`: canonical project signals, lanes,
  tiers, safety classes, modes, and severity.
- `../../references/panels.md`: persona/task profiles and access boundaries.
- `../../references/dispatch-policy.md`: approval and escalation boundaries.
- `../../references/report-formats.md`: JSON validation and Markdown rendering.
- `../../references/browser-preflight.md`: reviews with a running URL.
- `../../references/bmad-detection.md`: only for recognized BMAD signals or
  explicit BMAD scope.

## Workflow

1. Inspect the requested scope with fast read-only commands. Detect zero or more
   project labels with confidence and concrete file evidence. Disclose a generic
   fallback when evidence is insufficient.
2. Produce one compact parent dossier: scope, labels, stack/change context, risk
   signals, important files, test commands, exclusions, and explicit risk
   ownership for each selected lane. Do not make every reviewer rediscover the
   repository.
3. Select exactly three initial lanes from catalog evidence and the user goal.
   Prefer independent risk coverage over overlapping titles.
4. Show the panel and approval decision. Continue only when
   `dispatch-policy.md` permits automatic dispatch.
5. Dispatch isolated, read-only lane prompts containing only the relevant
   dossier slice. Withhold other reviewers' findings until consolidation.
6. Escalate only for high risk, ambiguous scope, high-risk `not_verified`,
   material conflicts, newly exposed risk, or explicit high-assurance scope.
   Automatic escalation stops at five well-justified read-only lanes.
7. Consolidate without manufacturing consensus. Merge duplicate root causes,
   preserve material disagreement/confidence, and keep unverified claims out of
   verified findings.
8. Follow `report-formats.md`: author and validate schema-2.0 JSON, then render
   Markdown deterministically. Respect `written` and `inline_only` artifacts.

## Panel proposal

```markdown
## Review Squad: Experts

Status: panel proposal — [auto-approved / approval required]
Target: [project]
Detected labels: [label (confidence, evidence)]
Scope: [bounded scope]
Artifact mode: [written / inline_only]

### Initial lanes

`[LANE]` [Name]

- Why: [goal/risk evidence]
- Scope: [bounded responsibility]
- Tier: [frontier / balanced / fast]
- Requested: [model and effort]

### Escalation candidates

- [lane only when a named trigger occurs]

### Dispatch decision

[Status and reasons from dispatch-policy.md]
```

## Model and runtime policy

- Use Sol/high frontier lanes for security, privacy, data integrity,
  reliability, architecture, complex compatibility, and conflict adjudication.
- Use Terra/medium for bounded tests, docs, developer experience, dependency
  inventory, and read-heavy scans. Use Terra/low for copy, metadata, and narrow
  checklists.
- Treat the live subagent tool schema as authoritative. Only pass model or
  effort settings when that schema supports them and the lane justifies them.
- Record requested tier and settings. Record actual model/effort when exposed;
  otherwise record them as unknown.

For the runtime current when this skill was released, a subordinate example is:

```text
task_name: "review_sec"
message: "You are the SEC lane..."
fork_turns: "none"
```

If the live schema differs, follow it instead of this example. Use a fork only
when exact parent context is essential; isolated self-contained prompts are the
default.

## Lane prompt

```text
You are the [LANE] lane reviewing [PROJECT LABELS].

Read only. Do not edit, reformat, revert, publish, or mutate external state.
Responsibility: [one bounded risk area]
Dossier: [lane-relevant scope, risks, files, tests, exclusions]
Owned risks: [risks this lane decides]
Adjacent lane ownership: [risk -> other lane]

Return only:
- lane, role, and one-sentence headline
- verified findings with critical/important/minor severity
- concrete file/URL evidence and source attribution
- suggested fix and confidence
- not_verified items with reason and follow-up

Do not infer missing evidence, repeat general repository discovery, or reframe
an adjacent lane's finding. Report a cross-cutting root only when it materially
affects your owned risk and state why it is not a duplicate.
```

## Consolidation

Apply the catalog severity factors: goal blockage, breadth, recoverability,
risk if ignored, and confidence/evidence. A critical finding requires concrete
high-impact evidence. Order findings by launch risk, preserve sources, and use a
workflow-neutral `decision` object only when an owner must answer a question.

After the rendered report, ask whether the user wants a dependency-ordered
implementation plan.
