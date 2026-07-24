# Reproducing RG-04 and RG-05

Historical 0.2.3 and WP-02 timing/duplicate claims remain
`not_reproducible`. Their original raw prompts, outputs, allocations, timing,
usage events, and raw-lane normalization ledger were not retained.

## Subjects and pre-call verification

`subjects-v1.json` defines the explicit `review-squad:experts` subjects and the
SHA-256 of every model-visible manifest, skill, reference, and catalog file.
Materialize v0.2.3 with `git show` from immutable commit
`f4ca1b80a9f165feb0d94dbcb2a2f45a279b2b25`; never checkout or alter the
worktree. Materialize v0.3.0 only from hash-matching current release inputs.

Before its first model call, the runner verifies the reproducibility metadata,
all four wrapper hashes, corpus, allocation, subject manifest, every
materialized subject file, and both expected plugin names/versions. Any
difference fails before model access.

## Two separate comparisons

Controlled quality uses four primary `gpt-5.6-sol`/high calls, the same neutral
wrapper and blinded allocation for both subjects, and no delegation. It
measures recall, unsupported critical findings, evidence validity, and severity
agreement without fan-out or delegated-model confounding.

Production behavior uses three ordinary samples per subject. v0.2.3 follows
its shipped 4–8 reviewer default (up to 24 delegated calls across three
samples). v0.3.0 follows three initial adaptive lanes, its five-lane cap, and
its shipped model-tier policy (up to 15 delegated calls). Do not force the same
lanes, fan-out, or Sol/high delegation on both subjects. Production metrics are
latency, field-level token usage, and duplicate instances from raw lane
findings; keep them separate from controlled-quality metrics.

Each production final preserves `lane_results` before parent consolidation:
lane identity, completion/failure, raw findings/evidence/severity,
not-verified state, delegation call ID and returned agent/task identity when
the JSONL exposes them, exact raw delegated response, and requested/runtime-
observed model and effort. The runner validates one-to-one delegation identity,
exact payload equality with retained JSONL, and equality between parent
`raw_findings` and findings extracted from that response. It retains the raw
delegation artifact and SHA-256. The consolidated parent
findings remain separate. If identity or raw lane results are unavailable,
duplicate reduction and delegated-model provenance are `not_verified`.

## Pilot (not release evidence)

Inspect the pilot without model calls:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --pilot-plan
```

The future guarded pilot command is:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --pilot-authorized --output /tmp/review-squad-eval-pilot-0.3.0
```

It declares `configured_top_level_primary_calls: 1`,
`configured_top_level_delegated_calls: 3`,
`configured_top_level_maximum_calls: 4`, and
`runtime_proven_global_maximum_calls: null` to
check real Codex JSONL shape, delegation detection, raw lane retention,
structured final parsing, `turn.completed.usage`, and process-tree shutdown.
It classifies token accounting as aggregate including delegation, primary-only,
independently exposed primary-plus-delegated, or semantically unknown from the
retained events. It never opens the oracle or runs scoring and cannot satisfy
RG-04 or RG-05. It stops as `completed_not_verified` unless ambient Review
Squad skill absence, stable unique delegation identities, one-to-one lane
mapping, and untouched raw payload provenance all verify. This ordinary pilot
does not deliberately exercise nested delegation. A compatible result also
retains the raw delegation artifact inside its evidence directory; the full
runner re-hashes that artifact before accepting the pilot prerequisite.

## Full run (not authorized)

Inspect the full plan without model calls:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --plan
```

The future guarded full command is:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --authorized --pilot-evidence /tmp/review-squad-eval-pilot-0.3.0/result.json --output /tmp/review-squad-eval-0.3.0
```

The configured top-level matrix limit is 12 primary calls and 39 delegated
calls: four controlled primary calls, six production parent calls, and two
independent scorers. Each production prompt makes failed calls count, forbids
replacement beyond its cap, and forbids nested delegation. The runner stops a
parent whose observed JSONL exceeds its cap. The full command validates a
current pilot result against every protocol hash before creating output or
making a model call. Since the ordinary pilot does not probe nesting, 51 is not
claimed as a runtime-proven global ceiling. A scorer disagreement does not
trigger automatic adjudication. A separately authorized bounded adjudicator
would raise the configured top-level maximum to 52 while leaving the runtime
global maximum unknown.

Expected duration is 60–120 minutes and expected evidence volume is 15–40 MB.
Three production samples per subject support descriptive statistics only.

## Evidence and scoring

Retain exact prompts/hashes, schemas, raw JSONL, untouched finals, delegation
events, partial stdout/stderr, structured diagnostics, UTC wall timestamps, and
monotonic `process.hrtime.bigint` timing. On timeout or interruption, close
stdin, wait, send SIGTERM, wait, send SIGKILL if required, and confirm exit.
Malformed/truncated JSONL is a structured failure with partial evidence.

Each review call uses a unique temporary cwd containing only its exact target
artifacts; the subject and controlled allocation are supplied directly in the
prompt. Other subjects, previous outputs, evidence, scorer inputs, and oracle
data are not supplied or named through that cwd. This is not a claim that the
OS sandbox makes arbitrary absolute repository paths unreadable. Scratch is
removed only after confirmed process-tree exit.

Every call retains its exact argv and hash. Invocation-local overrides disable
both `plugins."review-squad@codex-review-squad".enabled` and that plugin's
Playwright MCP. Each structured response reports whether the system Available
Skills inventory was exposed and every ambient Review Squad locator; a hidden
inventory or any ambient locator fails isolation.

Read input, cached-input, output, and reasoning-output fields independently
from `turn.completed.usage`. Missing values remain `not_verified`; do not
invent total tokens or pricing. Never compare primary-only usage as the total
cost of a delegated ordinary review.
Independently exposed delegated usage is complete only when unique usage
`delegation_call_id` values exactly match observed delegation IDs; reordered
identity-linked records are valid, while anonymous, duplicated, or missing
identities remain `semantically_unknown`.

Hash-seal all review JSONL and finals before opening `expectations.json`. Each
scorer must emit exactly one row per finding identity (`phase`, `call_id`,
`case_id`, `finding_index`) and may use only that case's declared root IDs or
`unsupported`. Deterministic code rejects omitted, duplicate, or invented rows
and computes aggregates. If scorer ledgers differ, retain exact disagreements,
keep the gate `not_verified`, and emit a one-call bounded adjudication plan;
never average or silently select a scorer.

`npm run eval:check` validates blinded inputs, hashes, contracts, and protocol
metadata. It does not run Codex, score outputs, or reproduce any model metric.
