# Review Squad 0.3.0 — WP-05 current-state packet

Status: **WP-05 complete; RG-08 passed; 0.3.0 release candidate ready.**
The independent read-only re-review returned `ready`, closed all three original
release blockers, and found no new 0.3.x follow-ups. Canonical evidence:
`docs/plans/evidence/review-squad-0.3.0-wp05-rg08.json`. RG-04 and RG-05 remain
`not_verified` and are accepted as explicit 0.3.x field-test risks.

## Integrated base/state

- Canonical plan: `docs/plans/review-squad-0.3.0.json`.
- Canonical original audit:
  `docs/plans/evidence/review-squad-0.2.3-audit.json`.
- Immutable v0.2.3 baseline commit:
  `f4ca1b80a9f165feb0d94dbcb2a2f45a279b2b25`.
- WP-00 through WP-05 are complete but uncommitted. RG-01, RG-02, RG-03,
  RG-06, RG-07, and RG-08 passed from retained evidence. RG-04/RG-05 remain
  documented, accepted 0.3.x field-test risks and are not release blockers.
- Root package and plugin manifest are exactly `0.3.0`; no committed cachebuster
  is allowed.

## Completed repository-local implementation

WP-00 established the baseline and blinded corpus. WP-01 implemented canonical
schema-2 JSON, semantic validation, migration, deterministic rendering, and
optional BMAD extension data. WP-02 added structured catalogs, deep multi-label
detection, adaptive dispatch, and report ownership. WP-03 added pinned browser
policy, isolation, diagnostics, and mutation boundaries. WP-04 added release
integration and a standalone installed runtime.

The correction passes additionally:

- made `validate-plugin.mjs` standalone: it resolves only plugin-local
  manifest, skills, catalog, schemas, bundled runtime, fixture, dependency
  manifest, notices, and licenses. README and marketplace consistency remain
  separate repository release/catalog checks;
- generated `runtime-dependencies.json` from esbuild metafile inputs and
  distributed exact license texts for Ajv, ajv-formats, fast-deep-equal,
  fast-uri, json-schema-traverse, and YAML. esbuild is explicitly build-time
  only, and YAML is correctly identified as ISC;
- corrected the public RG-07 description: `plugin add --json` `installedPath`
  is filesystem authority, marketplace `source.path` is source evidence,
  model locators are non-authoritative, and discovery uses a removable
  credential-free closed-world profile rather than `--ignore-user-config`;
- bundled Ajv/YAML into the installed plugin and proved target scripts cannot
  shadow its absolute runtime;
- fixed deep `**` matching and closed mode-specific report contracts;
- separated deterministic browser policy from real browser evidence;
- hardened the RG-06 verifier around the pin's `install-browser` CLI, exact
  released arguments, required tools, config/storage calls, bounded process
  shutdown, process-one positive and process-two negative storage controls,
  structured failure evidence, and one `/tmp` root;
- replaced the RG-07 shell recipe with a unique, machine-readable, finally-
  cleaned installed-plugin verifier. The exact `installedPath` from the
  `plugin add --json` receipt is the filesystem authority and is realpath,
  manifest/cachebuster, source-content, runtime, and fixture cross-checked.
  Fresh-session Available Skills inventory is behavioral evidence only;
  model locators are optional, non-authoritative diagnostics. A credential-free
  temporary profile disables every pre-existing plugin, replaces declared MCP
  servers with disabled inert entries containing no ambient transport or
  credentials, enables only the unique plugin, and is removed and verified
  absent in cleanup. The ambient config is not strict-validated; recognized
  legacy fields are retained as operator warnings and the invocation forces
  `approval_policy="never"` plus read-only sandboxing;
- added one shared, process-group-aware bounded subprocess lifecycle for
  RG-06, RG-07, and evaluation, with a real SIGTERM-resistant child/grandchild
  regression fixture and leak-retention contract. A direct-child close now
  permits one bounded natural descendant-drain grace before failure; signals or
  unconfirmed cleanup still cannot pass;
- split future RG-04/RG-05 work into no-delegation controlled quality and
  release-specific production behavior, preserving delegation-linked raw lane
  results, exact scorer disagreements, per-call scratch cwd isolation, and
  identity-linked semantic token-accounting status; ambient 0.2.3 plugin/MCP
  isolation is invocation-local and validated from the reported skill inventory;
- added an oracle-free non-release pilot declaring
  `configured_top_level_primary_calls: 1`,
  `configured_top_level_delegated_calls: 3`,
  `configured_top_level_maximum_calls: 4`, and
  `runtime_proven_global_maximum_calls: null`; and
- retained and deterministically adjudicated the completed RG-07 execution and
  the completed-but-not-compatible pilot without changing either original
  result; and
- kept the historical 139s→85s and duplicate-reduction values marked
  `not_reproducible`.

## Changed-file scope

The integrated diff covers root maintenance/release metadata; the canonical
plan, templates, handoff, and audit evidence; all five skill prompts; browser,
dispatch, report, catalog, and BMAD references; standalone runtime source and
bundle; guarded browser/installed/evaluation scripts; fixtures, goldens, and
WP-00 through WP-04 tests. Use `git status --short` and `git diff --stat` for the
exact current inventory; preserve all existing changes.

This gate-harness correction pass specifically changed:

- `AGENTS.md`, `README.md`;
- both 0.3.0 handoff documents under `docs/plans/`;
- `plugins/review-squad/references/browser-preflight.md`;
- report migration/rendering and project-detection CLIs plus the regenerated
  standalone runtime;
- plugin validation, browser verification, installed-plugin verification, and
  evaluation runner scripts;
- process lifecycle, installed provenance, and evaluation protocol libraries;
- the real child/grandchild lifecycle fixture under
  `plugins/review-squad/tests/fixtures/process/`;
- WP-02, WP-03, WP-04 release, and gate-harness tests; and
- evaluation reproduction instructions, metadata, subject manifest, and four
  immutable wrapper prompts under `plugins/review-squad/tests/eval/`.

The final WP-05 correction additionally changes standalone/catalog validation,
runtime dependency metadata, plugin-local license files and notices, packaging
and release tests, README wording, and this targeted re-review handoff. RG-06
and RG-07 canonical evidence files are unchanged.

## Dependencies and installed boundary

The installed plugin requires no `node_modules`. The generated runtime bundles
Ajv 8.20.0 (MIT), ajv-formats 3.0.1 (MIT), fast-deep-equal 3.1.3 (MIT),
fast-uri 3.1.4 (BSD-3-Clause), json-schema-traverse 1.0.0 (MIT), and YAML 2.9.0
(ISC). Full package license texts ship under `plugins/review-squad/licenses/`;
the exact input inventory is
`scripts/runtime/runtime-dependencies.json`. Root development pins are Ajv
8.20.0, ajv-formats 3.0.1, YAML 2.9.0, and esbuild 0.28.1. esbuild is build-time
only and is not included in the runtime bundle. Installed skills resolve
`scripts/runtime/review-runtime.mjs` from the loaded plugin location; they never
search or execute a reviewed target's `scripts/` directory.

## Allowed and forbidden actions

The completed WP-05 review was read-only. It read the repository and ran
repository-local commands without editing, committing, pushing, publishing,
tagging, installing/cachebusting plugins, mutating marketplaces, executing
downloaded browser software, running model evaluations, or starting external
gates.

## Exact repository-local verification

Run from the repository root:

```bash
pnpm install --frozen-lockfile
npm run check:runtime
npm run test:reports
npm run test:dispatch
npm run test:browser
npm run test:release
npm run test:harness
node --test plugins/review-squad/tests/wp04-packaging-isolation.test.mjs
npm test
npm run validate
npm run validate:catalog
npm run eval:check
python3 /home/runar/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/review-squad
python3 /home/runar/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/review-squad/skills/review-squad
python3 /home/runar/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/review-squad/skills/experts
python3 /home/runar/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/review-squad/skills/normies
python3 /home/runar/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/review-squad/skills/regulars
python3 /home/runar/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/review-squad/skills/well-actually
git diff --check
```

Packaging isolation is a first-class command:

```bash
node --test plugins/review-squad/tests/wp04-packaging-isolation.test.mjs
```

It must copy only `plugins/review-squad` below `/tmp`, run report validation,
rendering, migration, project detection, and BMAD detection without ancestor
`node_modules`, and prove a target-owned same-named runtime cannot shadow the
installed absolute runtime.

Recheck the tracked audit through installed-form runtime:

```bash
node plugins/review-squad/scripts/runtime/review-runtime.mjs migrate docs/plans/evidence/review-squad-0.2.3-audit.json --output /tmp/review-squad-audit-v2.json
node plugins/review-squad/scripts/runtime/review-runtime.mjs validate /tmp/review-squad-audit-v2.json
node plugins/review-squad/scripts/runtime/review-runtime.mjs render /tmp/review-squad-audit-v2.json --output /tmp/review-squad-audit-v2.md
```

Observed after the repository-local correction pass:

- frozen install: pass, already up to date;
- reproducible runtime check: pass;
- package-specific report/dispatch/browser/release/gate-harness tests: pass;
- direct gate-harness execution: pass, including child/grandchild SIGKILL
  escalation with zero fixture processes before and after;
- packaging isolation: pass;
- full suite: 7/7 test files, 0 failures;
- plugin, catalog, and eval protocol validators: pass;
- plugin-creator validation and all five skill-creator validations: pass;
- all 12 public CLI help invocations: exit 0; all 12 invalid invocations: exit
  2;
- all four guarded plan invocations, including `--pilot-plan`: exit 0 without
  authorized execution;
- audit migration, schema-2 validation, and rendering: pass; and
- `git diff --check`: pass.

`eval:check` reported 10 blinded cases across five surfaces and explicitly
reported that no model evaluation was run.

## RG-06 accepted evidence

The released MCP remains pinned to `@playwright/mcp@0.0.78` with
`--isolated`, `--block-service-workers`, `--caps storage,config`, and stdout
output. The exact tagged argument table omits storage/config, but the same
tag's generated tool catalog lists `browser_get_config`, cookie inspection,
local-storage inspection, and session-storage inspection. Those two
capabilities remain because production isolation guidance uses them; no
network, vision, PDF, devtools, or testing capability is shipped.

The plan remains inspectable without browser execution:

```bash
node plugins/review-squad/scripts/verify-real-browser.mjs --plan
```

The accepted authorized run used:

```bash
node plugins/review-squad/scripts/verify-real-browser.mjs --authorized --output /tmp/review-squad-rg06-0.3.0-evidence-retry.json
```

Canonical retained evidence:
`docs/plans/evidence/review-squad-0.3.0-rg06.json`, SHA-256
`e28a87db7f9163980e7ad98b661af81fae27629120a8b2df72b2364c7ffe202c`.
The run passed pinned installation, exact argument initialization, required
tool/config/storage inspection, real local navigation, process-one positive
storage controls, process-two negative isolation controls, zero protocol
errors, zero loopback POSTs, confirmed exits for both process groups, and
temporary-root cleanup.

The verified base-tool list included `browser_run_code_unsafe`; its presence is
not authorization. Review Squad policy forbids it as RCE-equivalent and emits
`BROWSER_UNSAFE_TOOL_FORBIDDEN` if it is requested, required, or accidentally
invoked. The verified `--caps storage,config` value is additive rather than a
base-tool allowlist. Read-only observed-traffic inspection tools were present,
while optional route/network mutation tools were absent.

It uses `npx -y @playwright/mcp@0.0.78 install-browser`, allows 12 minutes for
first installation and 90 seconds per ordinary MCP request, initializes the
exact released arguments, asserts and calls config/storage tools, verifies the
effective isolated/no-service-worker/no-profile/no-storage-state config,
navigates a loopback page, proves planted cookie/local/session state visible
through page evaluation and storage tools in process one and absent through
both paths in process two, requires empty protocol errors and confirmed exits
for both MCP trees, and
proves zero POSTs at the external-write boundary. Package cache, browser
binaries, explicit XDG/npm caches, TMPDIR, MCP output, and scratch data share
one unique `/tmp` root. The verifier never overrides `HOME`, `home`, or
`CODEX_HOME`. Evidence records stderr classification, every shutdown signal,
PID/process-group recovery guidance, and cleanup. An unconfirmed exit prevents
a pass and retains the temporary root.

## RG-07 guarded procedure

Dry-run only:

```bash
node plugins/review-squad/scripts/verify-installed-plugin.mjs --plan
```

Any future authorized command must use a new output directory:

```bash
node plugins/review-squad/scripts/verify-installed-plugin.mjs --authorized --output /tmp/review-squad-rg07-evidence
```

Every run generates a unique marketplace, plugin name, and cachebuster and
mutates only its temporary copy. It snapshots plugin/marketplace JSON plus the
repository manifest and uses JSON-producing Codex plugin commands. A plugin-
list `source.path` is retained only as marketplace/source evidence. The exact
`plugin add --json` `installedPath` is resolved and cross-checked before the
fresh session, and the installed runtime validates the installed fixture by
absolute path. The fresh session runs from an isolated `/tmp` working directory
with a unique temporary profile. A closed-world validator proves that profile
disables every pre-existing plugin, replaces each discovered user-config MCP
server with a disabled inert stdio sentinel, enables only the temporary plugin,
and disables ambient and temporary Playwright MCPs. It copies no transport,
environment, header, token, credential, or unrelated setting. The invocation
forces `approval_policy="never"`, read-only sandboxing, and ignored project
rules; `HOME` and `CODEX_HOME` are unchanged and no MCP, package, or browser
startup is expected. The model must report an empty ambient
Review Squad inventory plus the five exact temporary namespaced Available
Skills entries and descriptions. Any reported locator is diagnostic only and
cannot override the receipt-rooted filesystem checks. Finally the verifier
boundedly stops subprocesses and removes the temporary profile.
Confirmed ordinary command failures still allow plugin and marketplace
removal, verifies unique-state absence, confirms the original 0.2.3 entry and
repository 0.3.0 manifest are unchanged, and reports exact recovery commands
for partial cleanup. An unconfirmed exit prevents later mutation and retains
scratch. Absence checks use the exact generated plugin ID and marketplace.

RG-07 is passed after deterministic false-negative adjudication of the final
renewed execution. Attempts
one and two made no model request: Codex rejected incomplete disabled MCP
overlays before inference, first in the profile and then in direct argv. Attempt
three used complete disabled inert MCP entries and reached `turn.completed`.
Its raw response reports `inventory_source=system_available_skills`, zero
ambient Review Squad entries, and exactly five temporary namespaced entries
with exact descriptions and cache-root locators. Usage was 14,312 input, zero
cached input, 730 output, and 53 reasoning-output tokens. However, the shared
process controller observed descendants at the instant the direct child exited
and classified `descendants_survived_direct_child` before parsing. The same
record proves that the descendants drained during the bounded natural grace:
child and process group exits were confirmed with exit code zero, no signal was
attempted, no process leaked, and cleanup/state checks passed. The corrected
classifier waits that grace before failing; regression tests retain bounded
signal and leak behavior for descendants that remain.

The original failed result remains byte-identical at
`docs/plans/evidence/review-squad-0.3.0-rg07/original-result.json`, SHA-256
`b505241de1b014f6443a35492b7b8c70913d1a1f94e9319994fcf9f7d13de06c`.
Its byte-identical final response and JSONL are retained beside it with SHA-256
`0d79927d8d503f6fe343d700b6c8370738763ccab85c461174986a703c6d81b3`
and `6fe267f66f1bf0a90277edc1736f783db4b8913d177a8a1871bddda7c53f40ec`.
`docs/plans/evidence/review-squad-0.3.0-rg07/adjudication.json` records
`verdict=pass` and
`evidence_status=passed_after_false_negative_adjudication`. No second RG-07
external or model execution was used.

## RG-04/RG-05 pilot and reproducible procedure

Pilot dry-run only:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --pilot-plan
```

Executed pilot command:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --pilot-authorized --output /tmp/review-squad-eval-pilot-0.3.0-adjudicated-1
```

The pilot has `configured_top_level_primary_calls: 1`,
`configured_top_level_delegated_calls: 3`,
`configured_top_level_maximum_calls: 4`, and
`runtime_proven_global_maximum_calls: null`. It
checks real JSONL shape, delegation-call detection, raw lane result retention,
one-to-one stable identity, exact equality with retained delegated payloads,
an exposed and empty ambient Review Squad skill inventory, final parsing,
identity-linked usage capture, token-accounting semantics, and bounded process-
tree shutdown. Any false-pass state ends `completed_not_verified`. It never opens
the oracle or scores results and is not RG-04/RG-05 release evidence.
The full-run prerequisite also requires the retained raw delegation artifact
to remain inside the pilot evidence directory and match its declared SHA-256.

The one authorized pilot execution completed one primary turn and returned
three completed parent lane results. The JSONL exposed three completed
collaboration waits but no stable spawn identities or untouched delegated
outputs. The runner now correctly treats that runtime limitation as
`completed_not_verified`, not a process failure. Ambient Review Squad isolation,
structured final parsing, usage capture, bounded shutdown, and scratch cleanup
passed. Delegation identity, raw delegated-payload provenance, complete-workflow
token semantics, and the runtime global call ceiling remain `not_verified`.
No retry was used because this is an honest semantic compatibility result, not
a deterministic invocation defect. Canonical source artifacts and the
adjudication are under
`docs/plans/evidence/review-squad-0.3.0-pilot/`; its original result SHA-256 is
`d098d2249198e239a653433bcc472bf4c89b89c79f5424241d3783af4e187f80`.
The pilot is not a compatible prerequisite for the full evaluation and does
not satisfy RG-04 or RG-05.

Full-run dry-run only:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --plan
```

Full command, not run and still blocked by the incompatible pilot:

```bash
node plugins/review-squad/scripts/run-evaluation.mjs --authorized --pilot-evidence /tmp/review-squad-eval-pilot-0.3.0/result.json --output /tmp/review-squad-eval-0.3.0
```

`subjects-v1.json` records every model-visible manifest, skill, reference, and
catalog file plus SHA-256 for both subjects. Baseline files are materialized with `git show`
from `f4ca…` without changing the worktree. Exact composed prompts, schemas,
raw JSONL, untouched final responses, monotonic and wall timing, stderr,
delegation events, field-level `turn.completed.usage`, and requested-versus-
observed model metadata are retained. Before the first model call, every
declared hash and manifest identity is verified. Raw review outputs are hash-
sealed before oracle expectations are read.

Controlled quality uses four identical Sol/high, no-delegation allocations.
Production behavior uses three ordinary samples per subject with each release's
shipped contract: v0.2.3 keeps 4–8 reviewers (24 delegated-call ceiling) while
v0.3.0 keeps three initial adaptive lanes, a five-lane cap, and its own tier
policy (15 delegated-call ceiling). Failed calls count, replacements cannot
exceed the cap, and delegated lanes are forbidden to delegate. Two independent
scorers make the configured top-level matrix 12 primary plus at most 39
delegated. The runner aborts observed over-cap JSONL. The ordinary pilot does
not deliberately probe nesting, so the runtime global ceiling remains unknown.
A separately authorized one-call disagreement adjudication would raise only the
configured top-level maximum to 52. Expected duration is 60–120 minutes and evidence
volume 15–40 MB.

Every call uses a unique scratch cwd containing only exact target artifacts;
other subjects, prior output, evidence, scorer input, and oracle data are not
supplied or named through that cwd. This does not claim arbitrary absolute
repository paths are OS-inaccessible.

Production `lane_results` preserve raw lane identity, delegation call and
returned agent/task identity when exposed, exact raw response, findings, evidence,
severity, completion/failure, and model/effort provenance before separate
parent consolidation. Scorer rows are keyed by phase/call/case/finding index;
only case-declared roots or `unsupported` are allowed. Deterministic code
rejects incomplete/invented ledgers, computes aggregates, and emits exact
scorer disagreements without averaging. Controlled quality metrics remain
separate from production latency, tokens, and raw-lane duplication. Missing
delegation identity leaves duplicate/provenance claims `not_verified`. The
runner deterministically compares the parent payload and findings with retained
JSONL; missing, changed, parent-reconstructed, or unextractable payloads leave
duplicates `not_verified`. Delegated usage is complete only when unique usage
call IDs exactly match observed delegation IDs; reordered records are valid,
while anonymous, duplicate, or missing identities remain `not_verified`.

Every call retains exact effective argv evidence. Invocation-local overrides
disable the ambient 0.2.3 plugin and MCP, and each response must report an
exposed, empty ambient Review Squad skill inventory. The full command validates
the supplied pilot result, its in-directory raw delegation artifact hash, and
all current protocol hashes before creating its output or making any model call.

## Current release-gate state

| Gate | State | Evidence boundary |
| --- | --- | --- |
| RG-01 | pass | plugin and five skill validations |
| RG-02 | pass | schema, semantic, migration, rendering, installed packaging |
| RG-03 | pass | routing, BMAD, artifact, mutation, and deep-glob fixtures |
| RG-04 | not_verified | accepted 0.3.x field-test risk; historical data is not reproducible and no full subject-bound run was executed |
| RG-05 | not_verified | accepted 0.3.x field-test risk; no reproducible ordinary token/latency samples exist |
| RG-06 | pass | retained `review-squad-0.3.0-rg06.json`; SHA-256 `e28a87db7f9163980e7ad98b661af81fae27629120a8b2df72b2364c7ffe202c` |
| RG-07 | pass | retained immutable execution plus `review-squad-0.3.0-rg07/adjudication.json`; no second external/model execution |
| RG-08 | pass | independent WP-05 verdict `ready`; canonical evidence: `docs/plans/evidence/review-squad-0.3.0-wp05-rg08.json` |

Release blockers: none. Review Squad 0.3.0 is release-candidate ready; no
commit, tag, publish, or release action is recorded by this packet.

## Remaining field-test risk

Cross-platform/browser-install variants, authenticated sites, offline/cache
behavior, and broader supported-browser coverage remain documented 0.3.x
field-test risks despite the minimum RG-06 supported-environment pass.
Evaluation conclusions remain limited to the fixed corpus and three ordinary
samples per subject.
