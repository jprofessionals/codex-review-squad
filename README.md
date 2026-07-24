# Codex Review Squad

A Codex plugin that adapts the original Review Squad plugin created by
[2389 Research, Inc.](https://2389.ai).

This is a Codex port of 2389 Research's MIT-licensed Claude Code plugin:

- Codex port repository: https://github.com/jprofessionals/codex-review-squad
- Original Review Squad repository: https://github.com/2389-research/review-squad
- Original plugin page: https://skills.2389.ai/plugins/review-squad/
- Original copyright: Copyright (c) 2026 2389 Research, Inc.
- Original license: MIT

This repository keeps their core Review Squad concept and adapts it for Codex
skills, Codex plugin manifests, Codex subagents, and Playwright MCP.

Review Squad is standalone. It does not require any other Codex plugin. The
browser-oriented modes use Playwright MCP when available and degrade clearly
when it is not available.

It provides these skills:

- `review-squad:experts`
- `review-squad:normies`
- `review-squad:regulars`
- `review-squad:well-actually`

Use it when you want several focused reviewers to inspect the same project from
different perspectives: expert audit, first-time visitor impressions, real user
task flows, or last-mile polish.

Every completed Review Squad run authors one canonical schema-2.0 JSON report.
After validation, deterministic tooling renders its Markdown view:

```text
.review-squad/reports/<timestamp>-<mode>[-<label>...].md
.review-squad/reports/<timestamp>-<mode>[-<label>...].json
```

When an explicit target repository or approved output directory is writable,
both files use the same stem. For URL-only work without an approved writable
root, the report uses `inline_only` with null paths and returns validated JSON
plus rendered Markdown in chat. JSON is always the source of truth; Markdown is
never authored independently.

## Requirements

- Codex CLI with plugin marketplace support.
- Node.js 22+ for validation and Playwright MCP startup.
- For browser-based modes, a running site URL such as `http://localhost:3000`.
- For browser-based modes, a browser binary and Playwright MCP must be
  available. This plugin pins Playwright MCP and cannot prompt for installation:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@0.0.78",
        "--isolated",
        "--block-service-workers",
        "--caps",
        "storage,config",
        "--output-mode",
        "stdout"
      ]
    }
  }
}
```

The shipped optional capabilities are deliberately narrow. Playwright MCP
`--caps` is additive, so `storage,config` adds optional tools rather than
forming an allowlist for base tools. `storage` lets a
review inspect cookies (including state hidden from page JavaScript), local
storage, and session storage between cold personas, and `config` exposes the
effective isolation configuration. The exact v0.0.78 documentation is
internally inconsistent: its argument table omits these two capability names,
while its generated tool catalog includes them. Release verification therefore
asserts the actual pinned tool list and calls the required tools. The base
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
for each cold persona. They close the browser between personas and stop or
downgrade the claim if cookies, storage, cache, permissions, viewport,
navigation, or prior findings cannot be shown clean. Browser tasks are
read-only by default and stop before signup, checkout, contact, subscription,
upload, account changes, or another externally visible final action unless the
user explicitly approves a safe test/sandbox mutation.

If browser MCP is unavailable, the browser/persona skills stop cleanly with a
specific package, registry, binary, MCP-startup, target-URL, or isolation
diagnostic instead of pretending to browse. URL-only reviews with no approved
writable root render validated JSON and Markdown inline rather than writing in
an unrelated current directory.

## Marketplace File

Codex discovers this plugin through a marketplace root. A marketplace root is a
directory containing:

```text
.agents/plugins/marketplace.json
plugins/review-squad/
```

The marketplace file should contain:

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

In some Codex sandbox sessions, `.agents` may be mounted read-only. If that
happens, create the marketplace file from a normal shell checkout, or use the
global install option below.

## Local Install For One Project

Use this when you want the plugin vendored into one target project.

From this repository:

```bash
TARGET=/path/to/your/project

mkdir -p "$TARGET/.agents/plugins" "$TARGET/plugins"
cp -R plugins/review-squad "$TARGET/plugins/review-squad"
```

Create `$TARGET/.agents/plugins/marketplace.json` with the marketplace JSON from
the previous section.

Validate the copied plugin:

```bash
cd "$TARGET"
node plugins/review-squad/scripts/validate-plugin.mjs
```

Register that project as a local Codex marketplace:

```bash
codex plugin marketplace add "$TARGET"
```

Then start a new Codex session in the target project:

```bash
cd "$TARGET"
codex
```

Do not use `codex resume` for the first test after adding or upgrading the
marketplace. Resumed sessions keep the skill/plugin list they were started with.

Invoke the skills by name in your prompt, for example:

```text
Use review-squad:experts to audit this repo before launch.
```

## Global Install

Use this when you want Review Squad available from any project.

Option A: register this marketplace repository directly.

```bash
cd /path/to/codex-review-squad
node plugins/review-squad/scripts/validate-plugin.mjs
codex plugin marketplace add "$PWD"
```

Option B: keep a user-level marketplace root.

```bash
mkdir -p "$HOME/codex-marketplaces/review-squad/.agents/plugins"
mkdir -p "$HOME/codex-marketplaces/review-squad/plugins"
cp -R /path/to/codex-review-squad/plugins/review-squad \
  "$HOME/codex-marketplaces/review-squad/plugins/review-squad"
```

Create:

```text
$HOME/codex-marketplaces/review-squad/.agents/plugins/marketplace.json
```

using the marketplace JSON above, then run:

```bash
codex plugin marketplace add "$HOME/codex-marketplaces/review-squad"
```

If you publish this repository, Codex also supports marketplace sources such as
GitHub owner/repo names and Git URLs:

```bash
codex plugin marketplace add owner/codex-review-squad
codex plugin marketplace add https://github.com/owner/codex-review-squad.git
```

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

Review Squad writes reports only when the target repository or an explicitly
approved output directory is writable:

```text
.review-squad/reports/
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

## Best Use

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

Use the browser modes only when a running URL is available:

| Skill | Best for | How it runs |
| --- | --- | --- |
| `review-squad:experts` | Launch audits, SEO, accessibility, security, performance, project health | Parallel read-only expert review |
| `review-squad:normies` | "Do first-time visitors understand this?" | Independent cold browser personas |
| `review-squad:regulars` | "Can real users complete key flows?" | Isolated browser task attempts |
| `review-squad:well-actually` | Polish, nitpicks, typography, grammar, standards, HN-style feedback | Sequential browser/source pedants |

Good prompts:

```text
Use review-squad:experts to review this repo before launch.
```

```text
Run review-squad:normies on http://localhost:3000. Tell me where first-time
visitors get confused.
```

```text
Use review-squad:regulars on http://localhost:3000. Key flows are signup,
pricing, docs search, and contact sales.
```

```text
Run review-squad:well-actually on http://localhost:3000 before I post this.
```

For best results:

- Let ordinary expert panels start with the three catalog-selected lanes; add a
  fourth or fifth only for an explicit escalation trigger.
- Start first-impression work with the three job-based `DECIDE`, `VERIFY`, and
  `ADOPT` profiles; add profiles only for audience evidence or uncovered risk.
- Customize the proposed panel for your actual audience and stack.
- Use requested model tiers as policy, and treat the live subagent tool schema as
  authoritative for actual model/effort fields.
- Give browser modes a specific URL and make sure the dev server is already up.
- Give `regulars` explicit flows, environment, and test credentials if you know
  which ones matter; it stops before externally visible final actions by default.
- Treat `normies` as product clarity feedback, not a technical audit.
- Treat `well-actually` as a polish pass, then use the practical fixlist.
- Do not ask review agents to fix code during review. Review first, plan second,
  implement third.

## Attribution

Review Squad was originally created by 2389 Research, Inc. This repository is a
Codex adaptation of their MIT-licensed Claude Code plugin.

- Upstream repository: https://github.com/2389-research/review-squad
- Plugin page: https://skills.2389.ai/plugins/review-squad/
- Original copyright: Copyright (c) 2026 2389 Research, Inc.
- License: MIT

See `plugins/review-squad/LICENSE` and `plugins/review-squad/NOTICE.md`.
