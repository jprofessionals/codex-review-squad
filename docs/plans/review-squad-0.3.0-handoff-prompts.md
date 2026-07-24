# Review Squad 0.3.0 handoff prompt templates

These are baseline templates, not executable prompts. The technical lead must
generate a fresh prompt immediately before each delegation using the integrated
worktree as evidence. `review-squad-0.3.0.json` remains canonical.

Do not paste a template until every field in the current-state block is filled.
Use repository-relative paths so prompts remain portable.

## Required current-state block

```text
Repository root: <resolved by the receiving session>
Canonical plan: docs/plans/review-squad-0.3.0.json
Canonical audit: docs/plans/evidence/review-squad-0.2.3-audit.json

Integrated base/state:
<branch/commit or uncommitted base, dirty-state inventory, and relevant runtime>

Completed work packages:
<package -> acceptance status and integrated outcome>

Changed files:
<exact added/modified/deleted files relevant to this delegation>

Tests and exact outcomes:
<command -> exit status and material result; distinguish deterministic checks
from model, browser, and installed-runtime execution>

Accepted decisions and deviations:
<applicable plan decisions; evidence and smallest adjustment for any deviation>

Allowed files:
<exact files or directories the worker may write>

Forbidden files and actions:
<files outside ownership; external writes; commit/push/publish/tag/install rules>

Unresolved risks:
<not_verified behavior, environment gaps, conflicts, and field-test risks>

Remaining acceptance criteria:
<verbatim or precise concrete criteria this worker must satisfy>
```

## Worker wrapper

```text
Implement only <WP-ID> from the canonical plan. Read AGENTS.md and the complete
current-state block below before acting. The plan wins over this baseline
template.

<lead inserts required current-state block>

Role: <package owner role/model/effort from the plan>

Work only inside Allowed files. Preserve unrelated changes and do not alter an
accepted decision without repository evidence. Keep one implementation writer.
Run the package-specific commands plus every inherited integration command in
the state block. Do not hide a failed gate by weakening its fixture.

Return:
1. files changed;
2. commands and exact outcomes;
3. acceptance criteria with evidence;
4. decisions/deviations;
5. remaining uncertainty;
6. whether the dependent package is unblocked.

Do not continue into another work package.
```

Package focus to add after the wrapper:

- WP-00: immutable release baseline, deterministic fixtures, blinded corpus,
  and honest evidence capture before behavior changes.
- WP-01: canonical schema-2 JSON, semantic validation, deterministic rendering,
  v1.1 migration, and optional BMAD extension/detection.
- WP-02: structured catalogs, deep multi-label detection, current live dispatch
  schema, adaptive lanes, dossier ownership, and reproducible evaluation data.
- WP-03: pinned MCP configuration, isolation/mutation policy, diagnostics, and
  authorized real-browser evidence clearly separated from policy unit tests.
- WP-04: standalone installed bundle, documentation/version integration,
  plugin/skill validation, packaging isolation, guarded RG-06/RG-07 procedures,
  subject-bound RG-04/RG-05 evaluation protocol, and release-gate evidence.

## Independent WP-05 wrapper

WP-05 is complete and RG-08 passed after a targeted independent read-only
re-review returned `ready`. Canonical evidence is
`docs/plans/evidence/review-squad-0.3.0-wp05-rg08.json`. The template below is
retained for provenance and future reviews; it is not an outstanding 0.3.0
execution prompt.

The current-state block must distinguish `--plan` output from authorized
execution. Include the exact guarded commands and retained-evidence paths for:

```text
node plugins/review-squad/scripts/verify-real-browser.mjs --plan
node plugins/review-squad/scripts/verify-installed-plugin.mjs --plan
node plugins/review-squad/scripts/run-evaluation.mjs --pilot-plan
node plugins/review-squad/scripts/run-evaluation.mjs --plan
```

Never convert plan output into pass evidence. RG-06 is passed by the retained
`docs/plans/evidence/review-squad-0.3.0-rg06.json` evidence with SHA-256
`e28a87db7f9163980e7ad98b661af81fae27629120a8b2df72b2364c7ffe202c`.
RG-07 is passed by the immutable source artifacts and deterministic
`docs/plans/evidence/review-squad-0.3.0-rg07/adjudication.json`; the original
failed result remains unchanged and no second external/model execution was
used. RG-04 and RG-05 remain `not_verified` and are accepted only as documented
0.3.x field-test risks. A pilot execution validates only the evaluation
harness's real JSONL/delegation contract and cannot satisfy RG-04 or RG-05.

Do not call a pilot compatible unless it verifies an exposed and empty ambient
Review Squad skill inventory, three stable unique delegation identities,
one-to-one lane mapping, and exact equality with retained delegated JSONL
payloads. The full command is repository-blocked without a current pilot
`result.json` whose protocol fingerprint and those checks validate and whose
in-directory raw delegation artifact still matches its declared SHA-256.
The retained 0.3.0 pilot under
`docs/plans/evidence/review-squad-0.3.0-pilot/` is
`completed_not_verified`: ambient isolation and final parsing passed, but the
runtime exposed neither stable spawn identities nor untouched delegated output.
It therefore does not unblock the full evaluation and was not retried.

The retained WP-05 prompt required the reviewer to state whether every guarded process tree had
a confirmed exit, include retained leak/recovery evidence if not, and preserve
the evaluation runner's configured top-level call cap versus its separately
`not_verified` global nested-delegation ceiling. The independent reviewer closed
the standalone copied-layout, deterministic third-party license, and public
RG-07-description findings. RG-08 is `pass`; RG-04/RG-05 remain accepted 0.3.x
field-test risks rather than release blockers.

```text
Independently review WP-00 through WP-04 using Sol/high. Do not edit repository
files or trust the implementation lead's verdict. Reproduce available evidence
and return ready, ready_with_field_test_risk, or not_ready, with an RG-01 through
RG-08 table. Treat missing real-browser or fresh-installed-plugin execution as
not_verified unless supplied evidence proves otherwise. Do not publish, push,
tag, install, cachebust, or mutate external state.

<lead inserts required current-state block and independent-review commands>
```
