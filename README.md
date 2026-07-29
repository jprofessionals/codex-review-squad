# Codex Review Squad

Multi-perspective project, product, and UX reviews for Codex.

Review Squad gives Codex a small team of focused reviewers instead of asking one
agent to notice everything. Use it for launch audits, first-impression testing,
realistic task flows, or a final opinionated polish pass.

## What It Is

This repository is an independent Codex adaptation of the original
[Review Squad](https://github.com/2389-research/review-squad) plugin created by
[2389 Research, Inc.](https://2389.ai). The upstream Claude Code plugin is
MIT-licensed; this port preserves the core Review Squad idea and adapts it to
Codex skills, plugins, subagents, structured reports, and Playwright MCP.

- Codex port: [jprofessionals/codex-review-squad](https://github.com/jprofessionals/codex-review-squad)
- Original repository: [2389-research/review-squad](https://github.com/2389-research/review-squad)
- Original plugin page: [skills.2389.ai/plugins/review-squad](https://skills.2389.ai/plugins/review-squad/)
- Original copyright: Copyright (c) 2026 2389 Research, Inc.
- License: MIT

Review Squad is standalone and does not require another Codex plugin. Browser
modes use the pinned Playwright MCP integration bundled by this plugin.

## Why Use It

A broad request such as "review this before launch" mixes several kinds of
judgment. Review Squad separates them into explicit lanes or personas, gives
each reviewer a bounded job, and consolidates the evidence afterward. This
helps you get:

- broader coverage without one oversized prompt;
- independent first impressions instead of personas contaminating each other;
- fewer duplicate findings through explicit ownership;
- severity-ranked findings with evidence and source attribution;
- clear `not_verified` results when a check could not be completed;
- one canonical schema-2.0 JSON report and a deterministic Markdown view.

Choose a mode directly or let the router choose:

| Skill | Use it for |
| --- | --- |
| `review-squad:review-squad` | Choosing the appropriate mode when you are unsure |
| `review-squad:experts` | Launch readiness, architecture, security, reliability, accessibility, SEO, performance, and project health |
| `review-squad:normies` | Whether first-time visitors understand a rendered product or page |
| `review-squad:regulars` | Whether realistic users can complete named browser flows |
| `review-squad:well-actually` | Last-mile polish, copy, typography, standards, and opinionated nitpicks |

## Install

### Recommended: install directly from GitHub

No clone, local checkout, `npm install`, or manual marketplace file is needed:

```bash
codex plugin marketplace add jprofessionals/codex-review-squad
codex plugin add review-squad@codex-review-squad
codex plugin list --json
```

The first command adds this Git repository as a Codex marketplace. The second
installs Review Squad from that marketplace. In the final output, confirm that
`review-squad@codex-review-squad` is installed, enabled, and reports the expected
version.

Start a new Codex thread after installation so the thread loads the new skills
and MCP configuration. Do not resume an older thread for the first verification.

### Upgrade an existing installation

Refresh the Git-backed marketplace and reinstall the plugin from its new
snapshot:

```bash
codex plugin marketplace upgrade codex-review-squad
codex plugin add review-squad@codex-review-squad
codex plugin list --json
```

Then start a new Codex thread. Existing threads retain the plugin and skill set
they started with.

### Pin a specific release

For a reproducible first installation, pin the marketplace to a release tag:

```bash
codex plugin marketplace add jprofessionals/codex-review-squad --ref vX.Y.Z
codex plugin add review-squad@codex-review-squad
```

Replace `vX.Y.Z` with a tag from
[Releases](https://github.com/jprofessionals/codex-review-squad/releases). A
pinned marketplace stays on that ref until its marketplace configuration is
changed.

## Quick Start

Run commands from the project you want reviewed, then name the skill in your
prompt.

If you are unsure which mode fits:

```text
Use review-squad:review-squad to choose the best review mode for this project.
Show me the proposed panel before dispatch.
```

For a codebase or launch audit:

```text
Use review-squad:experts to review this repository before launch. Focus on
security, reliability, architecture, tests, and developer experience. Review
only; do not change files.
```

For first-time visitor feedback:

```text
Run review-squad:normies on http://localhost:3000. Tell me what first-time
visitors understand, where they hesitate, and what they would try next.
```

For realistic task completion:

```text
Use review-squad:regulars on http://localhost:3000. Test signup, pricing, docs
search, and contact sales. Stop before any externally visible final action.
```

For a final polish pass:

```text
Run review-squad:well-actually on http://localhost:3000 before I publish it.
Return a prioritized practical fixlist.
```

## Use It Well

- Give the squad a concrete goal, target, scope, and anything it must not do.
- Use `experts` for source-aware technical risk; use `normies` for product
  clarity, not as a substitute for a technical audit.
- Give browser modes a specific URL and start the development server yourself
  before the review. Review Squad does not start or restart it implicitly.
- Give `regulars` named flows, environment details, and test credentials only
  when those flows genuinely require them. It stops before externally visible
  final actions by default.
- Let ordinary expert reviews start with three risk-selected lanes. Add more
  only when the proposed panel identifies a real coverage gap or escalation
  trigger.
- Keep cold browser personas independent. Run `normies` before source-aware
  reviews when combining modes.
- Review first, decide what matters, then implement fixes in a separate step.
  Asking reviewers to edit while they inspect weakens the evidence trail.
- Treat `not_verified` as useful output: it names uncertainty instead of
  turning an incomplete check into a confident finding.

All modes show their proposed panel before dispatch. Auto-approved panels
continue immediately; approval-required panels explain why they paused.
Decisions that need a Product Owner or another human remain explicit rather
than being silently resolved by the squad.

## Reports

Every completed run authors one canonical schema-2.0 JSON report. After it
validates, the bundled runtime deterministically renders the Markdown view:

```text
<target>/.review-squad/reports/<timestamp>-<mode>[-<label>...].json
<target>/.review-squad/reports/<timestamp>-<mode>[-<label>...].md
```

The default is to persist both files under a writable target repository. You
can disable persistence for one run:

```text
Report artifacts: inline_only
```

Or write the pair directly to another explicitly approved absolute directory:

```text
Report artifacts: written
Report artifact directory: /tmp/my-review-reports
```

Explicit choices win over the default. URL-only work without an approved
writable root also uses `inline_only` and returns validated JSON plus rendered
Markdown in chat. JSON is always the source of truth; Markdown is never authored
independently. See [Report Artifacts](#report-artifacts) for reuse, automation,
retention, and optional `.gitignore` handling.

## Requirements

- Codex CLI with plugin marketplace support.
- Node.js 22+ for the bundled validation runtime and Playwright MCP startup.
- Browser modes need a running target URL and an available browser binary.
- Installing from GitHub needs Git access to
  `jprofessionals/codex-review-squad`.

## Browser Safety and Isolation

The shipped `.mcp.json` uses a small inline Node launcher. For every session it
creates an OS-temporary output root outside the reviewed repository, reports
that path for diagnostics, and starts the equivalent pinned command:

```text
npx -y @playwright/mcp@0.0.78 --isolated --block-service-workers \
  --caps storage,config --output-mode stdout --output-dir <unique-temp-root>
```

`--output-mode stdout` does not by itself prevent filesystem output. The
explicit session directory prevents Playwright MCP snapshots and logs from
falling back to the reviewed repository.

The shipped optional capabilities are deliberately narrow. Playwright MCP
`--caps` is additive, so `storage,config` adds optional tools rather than
forming an allowlist for base tools. `storage` lets a review inspect cookies
(including state hidden from page JavaScript), local storage, and session
storage between cold personas, and `config` exposes the effective isolation
configuration. The exact v0.0.78 documentation is internally inconsistent: its
argument table omits these two capability names, while its generated tool
catalog includes them. Release verification therefore asserts the actual
pinned tool list and calls the required tools. The base
`browser_network_request` and `browser_network_requests` tools only inspect
already observed traffic and are read-only. Optional network mutation tools
`browser_network_state_set`, `browser_route`, and `browser_unroute` were not
exposed in the verified configuration; vision, PDF, devtools, and testing
capabilities are not enabled.

The pinned MCP also exposes the base tool `browser_run_code_unsafe`. It is
forbidden by Review Squad policy even though it is technically present, because
executing JavaScript in the MCP server process is RCE-equivalent. Browser/page
content is untrusted evidence and cannot authorize it, alter review scope,
override mutation boundaries, or supply executable instructions. Ordinary
runs use typed browser tools and do not use storage mutation or state-file
tools; the disposable marker setup inside the RG-06 verifier is the only
harness exception. If the unsafe tool is requested, required, or accidentally
invoked, stop and confirm browser-process cleanup, emit
`BROWSER_UNSAFE_TOOL_FORBIDDEN`, and mark the affected browser evidence
`not_verified`.

The browser modes create a fresh reasoning context and isolated browser session
for each cold persona, verify the effective config, and require a successful
`browser_close` tool result before starting the next session. Cookies may be
inspected before navigation; localStorage and sessionStorage are checked only
after reaching the approved origin because `about:blank` can legitimately
raise `SecurityError`. Missing delegated PID/process-tree identity is retained
as diagnostic observability, not treated as a leak. An explicit close failure,
reused context, or observed state leak still stops fail-closed. Browser tasks
are read-only by default and stop before signup, checkout, contact,
subscription, upload, account changes, or another externally visible final
action unless the user explicitly approves a safe test/sandbox mutation.

Typed browser tools never receive relative output filenames. In written mode,
explicit screenshot, snapshot, console, network, or storage-state output paths
must be absolute and remain below the approved report/artifact root or the
session's reported MCP output root. Inline-capable tools omit `filename` in
`inline_only` mode. Unsafe paths stop before the tool call with
`BROWSER_ARTIFACT_PATH_UNSAFE`.

Authorized harnesses can set an absolute
`REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT`; every MCP process then creates and reports
its own unique output directory below that base. Explicit browser filenames use
the reported child directory, which is the actual MCP file-access boundary.

Browser preflight reports the effective approval policy and reviewer when the
runtime exposes them. An unattended delegated persona that needs `browser_click`
or another approval-requiring action is not dispatched under `on-request` with
a `user` reviewer. Start a new `on-request` + `auto_review` session, or
explicitly choose a snapshot-only fallback. A stalled tool reports
`BROWSER_MCP_TOOL_TIMEOUT` with approval and MCP-begin context; unresolved
action calls are never retried, and `browser_close` waits for a terminal result
or confirmed cancellation.

If browser MCP is unavailable, the browser/persona skills stop cleanly with a
specific package, registry, binary, MCP-startup, target-URL, or isolation
diagnostic instead of pretending to browse. URL-only reviews with no approved
writable root render validated JSON and Markdown inline rather than writing in
an unrelated current directory.

## Advanced Installation Options

The recommended GitHub installation above is enough for normal use. The
following options are for contributors, vendoring, or custom marketplaces.

### Install from a local clone

```bash
git clone https://github.com/jprofessionals/codex-review-squad.git
cd codex-review-squad
node plugins/review-squad/scripts/validate-plugin.mjs
codex plugin marketplace add "$PWD"
codex plugin add review-squad@codex-review-squad
```

### Vendor the plugin into one project

From this repository:

```bash
TARGET=/path/to/your/project

mkdir -p "$TARGET/.agents/plugins" "$TARGET/plugins"
cp -R plugins/review-squad "$TARGET/plugins/review-squad"
```

Create `$TARGET/.agents/plugins/marketplace.json` using the marketplace JSON
below, then register and install it:

```bash
cd "$TARGET"
node plugins/review-squad/scripts/validate-plugin.mjs
codex plugin marketplace add "$TARGET"
codex plugin add review-squad@codex-review-squad
```

### Marketplace layout

A local marketplace root contains:

```text
.agents/plugins/marketplace.json
plugins/review-squad/
```

Its `.agents/plugins/marketplace.json` is:

```json
{
  "name": "codex-review-squad",
  "interface": {
    "displayName": "Codex Review Squad"
  },
  "plugins": [
    {
      "name": "review-squad",
      "source": {
        "source": "local",
        "path": "./plugins/review-squad"
      },
      "policy": {
        "installation": "INSTALLED_BY_DEFAULT",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Start a new Codex thread after adding or updating any marketplace. Resumed
threads retain the plugin list they started with.

## Standalone Runtime Dependencies

The installed plugin does not depend on an ancestor `node_modules`. The root
`devDependencies` are direct build inputs: Ajv validates JSON reports,
ajv-formats supplies standard JSON Schema format checks, YAML parses YAML
project manifests, and esbuild produces the standalone runtime bundle.

esbuild also bundles the transitive packages required by those libraries. Keep
transitive packages out of `package.json` unless Review Squad imports them
directly. The generated
[`runtime-dependencies.json`](plugins/review-squad/scripts/runtime/runtime-dependencies.json)
is the exact machine-readable inventory of code included in the bundle, while
[`THIRD_PARTY_NOTICES.md`](plugins/review-squad/THIRD_PARTY_NOTICES.md) and the
plugin-local `licenses/` directory carry the corresponding attribution and
license texts.

## Validation

The plugin validator is standalone: it resolves every input from the plugin
directory containing the script and never reads an ancestor README,
marketplace, package manifest, or `node_modules`. From the marketplace root:

```bash
node plugins/review-squad/scripts/validate-plugin.mjs
```

The exact copied-bundle layout is also supported:

```bash
STANDALONE_ROOT="$(mktemp -d /tmp/review-squad-standalone.XXXXXX)"
cp -R plugins/review-squad "$STANDALONE_ROOT/review-squad"
cd "$STANDALONE_ROOT"
node review-squad/scripts/validate-plugin.mjs
```

The validator checks:

- Required files exist.
- Canonical, legacy, and extension schemas parse and use their expected versions.
- Catalog modes, project signals, lanes, tiers, safety classes, schema branches,
  manifest prompts, and skills stay internally consistent.
- JSON manifests parse.
- Every skill has YAML frontmatter with `name` and `description`.
- The plugin manifest references `./skills/` and `./.mcp.json`.
- The generated runtime dependency manifest, notices, and complete plugin-local
  license files agree.

Repository integration checks remain separate: `npm run validate:catalog` and
the release tests verify that the root README documents every mode and that the
marketplace entry, path, policy, category, and release metadata remain
consistent.

Run all deterministic release checks with:

```bash
pnpm install --frozen-lockfile
npm run check:runtime
npm test
npm run eval:check
npm run validate:catalog
npm run validate
```

`eval:check` validates corpus blinding, allocation, prompt hashes, and evidence
metadata. It does not dispatch reviewers or reproduce historical model, token,
latency, or duplicate metrics.

The external release gates are guarded and inert in plan mode:

```bash
node plugins/review-squad/scripts/verify-real-browser.mjs --plan
node plugins/review-squad/scripts/verify-installed-plugin.mjs --plan
node plugins/review-squad/scripts/run-evaluation.mjs --pilot-plan
node plugins/review-squad/scripts/run-evaluation.mjs --plan
```

Their `--authorized` forms require explicit approval. Browser installation,
plugin/marketplace mutation, and model evaluation are never performed by the
repository-local release suite. The pilot declares
`configured_top_level_primary_calls: 1`,
`configured_top_level_delegated_calls: 3`,
`configured_top_level_maximum_calls: 4`, and
`runtime_proven_global_maximum_calls: null`. It is authorization-guarded, never opens the
oracle, and cannot count as RG-04/RG-05 evidence or prove nested-delegation
observability.

The browser verifier confines npm/XDG caches, browser binaries, TMPDIR, and MCP
output below one temporary root without overriding `HOME`, `home`, or
`CODEX_HOME`. For RG-07, the verified `installedPath` returned by
`codex plugin add --json` is authoritative filesystem provenance. Plugin-list
`source.path` is retained only as marketplace/source evidence, and
model-reported `SKILL.md` locators are optional, non-authoritative diagnostics.
The fresh discovery session uses a temporary, credential-free, closed-world
Codex profile that disables ambient plugins and MCP servers, enables only the
unique temporary plugin, and is removed during cleanup. It deliberately does
not use `--ignore-user-config`: that option would also remove the temporary
profile layer required for plugin discovery. The invocation separately forces
read-only sandboxing and a fail-closed approval policy, disables ambient and
temporary Playwright MCP, and expects no MCP/package/browser startup.

Evaluation keeps no-delegation controlled quality separate from shipped
production behavior. The configured top-level limit is 12 primary plus 39
delegated calls; 51 is not a runtime-proven global ceiling. The full command is
blocked unless a current hash-matching pilot result verifies ambient skill
isolation, stable delegation identities, and untouched delegated payload
provenance, including its retained raw artifact SHA-256. v0.2.3 retains 4–8 reviewers and v0.3.0 retains three adaptive
initial lanes capped at five with its own tier policy. Raw `lane_results` stay
linked to observed delegation IDs when the JSONL supports it and separate from
parent consolidation. Deterministic scoring rejects missing,
invented, cross-case, or disagreeing ledger mappings.

## Troubleshooting Installation

If Codex says something like:

```text
The named skill is not installed here, so I recreated the documented panel...
```

then the skill was not loaded in that session. The review may still imitate the
documented workflow, but it is not actually running the installed
`review-squad:experts` skill.

First identify the marketplace source:

```bash
codex plugin list
```

For a local-filesystem marketplace, validate or update the local source, confirm
`codex plugin list` points at it, and start a brand-new Codex session. Do not use
`codex plugin marketplace upgrade`; that command refreshes Git marketplace
snapshots and does not refresh a local directory. Do not resume an older session
for verification because it retains its startup plugin list.

For a Git-backed marketplace, refresh its snapshot, then start a new session:

```bash
codex plugin marketplace upgrade codex-review-squad
```

If it still is not loaded, confirm the plugin is enabled in
`~/.codex/config.toml`:

```toml
[plugins."review-squad@codex-review-squad"]
enabled = true
```

You can inspect what the model will see with:

```bash
codex debug prompt-input "use review-squad:experts to review this repo" \
  | rg "review-squad|experts"
```

## Report Artifacts

Review Squad resolves report storage before dispatch and displays the selected
mode and directory. The policy is intentionally prompt-scoped:

| Prompt choice | Result |
| --- | --- |
| Omitted | Write to `<target>/.review-squad/reports/` when the target is explicitly writable; otherwise use `inline_only` |
| `Report artifacts: inline_only` | Write no report files, even when the target is writable |
| `Report artifacts: written` plus `Report artifact directory: /absolute/path` | Write the JSON/Markdown pair directly to the approved directory |

An alternative report directory must be absolute, writable, and explicitly
approved. Review Squad does not silently fall back to a different directory.
Report-output approval does not authorize browser artifacts or other project
writes.

The default repository location is:

```text
<target>/.review-squad/reports/
```

Each written run creates JSON and generated Markdown with the same stem:

```text
20260502T083200Z-experts-story-1.15-pr-10-origin-main.md
20260502T083200Z-experts-story-1.15-pr-10-origin-main.json
```

Filename stems use:

- A compact UTC timestamp: `YYYYMMDDTHHMMSSZ`
- The Review Squad mode: `experts`, `normies`, `regulars`, or `well-actually`
- Optional filename-safe labels that identify what was reviewed

Useful labels include story ids, PR numbers, base branches, current branches, or
other explicit context from the prompt:

```text
story-1.15
pr-10
origin-main
```

Labels are sanitized to `A-Z`, `a-z`, `0-9`, `.`, `_`, and `-`. If Review Squad
cannot determine a label confidently, it omits the label instead of guessing.

### Use reports after the review

The Markdown file is the human-readable handoff. The JSON file is canonical and
is suitable for agents, scripts, comparisons, and CI checks. Common follow-up
uses include:

- Give the JSON report to a separate fix job so it can triage or implement
  accepted findings without rerunning the expensive review.
- Convert selected `critical` and `important` findings into an implementation
  plan, issues, or acceptance checks while preserving evidence and
  `not_verified` items.
- Validate stored reports before an automated workflow consumes them:

  ```bash
  node "<installed-plugin-root>/scripts/runtime/review-runtime.mjs" \
    validate /absolute/path/to/report.json
  ```

- Re-render Markdown at any time from canonical JSON:

  ```bash
  node "<installed-plugin-root>/scripts/runtime/review-runtime.mjs" \
    render /absolute/path/to/report.json --output /absolute/path/to/report.md
  ```

A concise fix-job prompt can be as simple as:

```text
Use /absolute/path/to/report.json as the canonical Review Squad input. Do not
rerun the review. Verify the relevant evidence, propose a dependency-ordered
fix plan, and implement only the findings I approve.
```

In `written` mode the chat response stays compact: verdict, counts, recommended
next move, absolute report paths, and SHA-256 hashes. It does not repeat the full
JSON or Markdown unless you ask. In `inline_only` mode both validated
representations are returned in chat because no persistent report files exist;
temporary validation scratch stays outside the target and is removed afterward.

### Git and retention

Reports are local artifacts by default, but Review Squad never edits the
reviewed repository's `.gitignore`. If your team does not want root-level
reports in version control, add this optional repository-relative rule:

```gitignore
/.review-squad/
```

Leave the directory tracked when review reports are intentional audit evidence
or shared handoffs. Review Squad does not delete old reports automatically;
archive, compare, or remove timestamped runs according to your own retention
policy.

### Canonical JSON contents

The canonical JSON report always includes:

- `schema_version: "2.0"`
- `findings: []`, even when no findings were found
- `not_verified: []`, even when everything was verified
- `mode_data` for the selected mode
- `artifacts.status` as `written` or `inline_only`
- Stable `review_context` fields, including `story` as `null` when unknown
- `generator.name`, `generator.version`, and `generator.skill`
- Per-finding severity, non-empty evidence, non-empty source attribution, and a
  suggested fix
- Optional structured impact and a workflow-neutral `decision` object when an
  owner must answer a question

Finding severities are only `critical`, `important`, and `minor`. Unverified
checks belong in `not_verified[]` rather than as a severity.

Summary and regulars scorecard counts are derived from their arrays. Task
results, persona output, confusion rows, and practical fixes use closed
structures. Empty evidence/source, undeclared sources, malformed mode data, or
contradictory counts fail validation. Schema 1.1 remains available only as
migration input. Resolve the installed plugin root from the loaded skill or
reference path; never run a same-named script from the reviewed target:

```bash
node "<installed-plugin-root>/scripts/runtime/review-runtime.mjs" migrate legacy.json --output report-v2.json
```

BMAD is optional. Review Squad confirms it only from `_bmad/` plus
`_bmad/_config/manifest.yaml`, or the legacy `.bmad-core/` plus
`.bmad-core/install-manifest.yaml`; modern takes precedence. Supporting files
alone never confirm installation. Even a confirmed installation stays inactive
unless the request/scope contains BMAD work such as a story, acceptance criteria,
lifecycle command, relevant config change, or generated artifact. Generic
reports contain no BMAD placeholders or sections; active meaningful data uses
`extensions.bmad` schema `1.0`.

## Reviewer Selection and Cost Control

Start with `review-squad:experts` for launch readiness or codebase risk. It
detects multiple project labels with evidence, creates one compact dossier, and
starts with three risk-selected lanes. It uses `gpt-5.6-sol`/high for security,
privacy, data integrity, reliability, architecture, complex compatibility, and
conflict adjudication; `gpt-5.6-terra`/medium or low handles bounded tests, docs, dependency scans,
copy, metadata, and other narrow work. It adds lanes only for explicit risk,
ambiguity, high-risk unverified work, conflict, uncovered risk, or high-assurance
scope, and automatic escalation stops at five lanes.

All modes show their proposed panel before dispatch. Auto-approved panels
continue immediately; approval-required panels state the exact reason for the
pause. Findings that need a Product Owner or another human decision remain a
post-review control point and are not silently resolved by the squad.

Project types include web, backend API, mobile, CLI, data pipeline,
agent/plugin/prompt, library/SDK, infrastructure/IaC, and CI/tooling. Explicit
risk ownership and adjacent-lane exclusions are designed to reduce repeated
discovery and duplicate findings while preserving conflicting conclusions;
historical reduction numbers remain non-reproducible until a raw-output run is
retained under the documented evaluation protocol.

Codex plugins cannot currently define Claude Code-style custom visual panels in
the chat UI. This plugin uses structured Markdown instead: lane IDs, panel
cards, dispatch waves, progress updates, and a final squad scorecard. Final
reports avoid wide Markdown tables because long file paths wrap poorly in
Codex's terminal layout. Expert panels group lanes by priority first, then show
subagent reasoning effort inside each lane card.

## Attribution

Review Squad was originally created by 2389 Research, Inc. This repository is a
Codex adaptation of their MIT-licensed Claude Code plugin.

- Upstream repository: https://github.com/2389-research/review-squad
- Plugin page: https://skills.2389.ai/plugins/review-squad/
- Original copyright: Copyright (c) 2026 2389 Research, Inc.
- License: MIT

See `plugins/review-squad/LICENSE` and `plugins/review-squad/NOTICE.md`.
