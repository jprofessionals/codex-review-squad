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

Every completed Review Squad run writes paired report artifacts:

```text
.review-squad/reports/<timestamp>-<mode>[-<label>...].md
.review-squad/reports/<timestamp>-<mode>[-<label>...].json
```

The chat response remains Markdown for humans and includes the JSON report path
for automation. The Markdown artifact contains the full human report. The JSON
artifact follows `plugins/review-squad/references/review-report.schema.json`.

## Requirements

- Codex CLI with plugin marketplace support.
- Node.js for the validation script and Playwright MCP startup.
- For browser-based modes, a running site URL such as `http://localhost:3000`.
- For browser-based modes, Playwright MCP must be available. This plugin ships:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

If browser MCP is unavailable, the browser/persona skills are designed to stop
cleanly and explain what is missing instead of pretending to browse.

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

Run this from the marketplace root:

```bash
node plugins/review-squad/scripts/validate-plugin.mjs
```

The validator checks:

- Required files exist.
- The structured report JSON schema exists and parses.
- JSON manifests parse.
- Every skill has YAML frontmatter with `name` and `description`.
- The plugin manifest references `./skills/` and `./.mcp.json`.
- The marketplace references `./plugins/review-squad`.

## Troubleshooting Installation

If Codex says something like:

```text
The named skill is not installed here, so I recreated the documented panel...
```

then the skill was not loaded in that session. The review may still imitate the
documented workflow, but it is not actually running the installed
`review-squad:experts` skill.

Fix it with:

```bash
codex plugin marketplace upgrade codex-review-squad
```

Then start a brand-new Codex session in the target repo. Do not resume an older
session for this verification.

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

Review Squad always writes reports into the target repository:

```text
.review-squad/reports/
```

Each run creates a paired Markdown and JSON report with the same stem:

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

The JSON report always includes:

- `schema_version: "1.1"`
- `findings: []`, even when no findings were found
- `not_verified: []`, even when everything was verified
- `mode_data` for the selected mode
- `decision_summary` with patchable, decision-required, and BMAD-blocking
  counts
- Stable `review_context` fields, including `story` as `null` when unknown
- `generator.name`, `generator.version`, and `generator.skill`
- Per-finding severity, structured impact, remediation, evidence, decision
  flags, workflow flags, and human gate summary

Finding severities are only `critical`, `important`, and `minor`. Unverified
checks belong in `not_verified[]` rather than as a severity.

Evidence entries always include `kind`, `path`, `line`, `line_end`, `url`, and
`detail`; fields that do not apply are `null`. Impact is structured as
`runtime`, `architecture`, and `delivery`.

When a finding requires a human decision, blocks BMAD, or has any decision flag,
Review Squad adds a concrete command recommendation. If the story is unknown,
it uses an explicit `STORY=<story>` placeholder. Example:

```bash
make story-run-decision STORY=1.2 RESUME_DECISION=stop_and_create_follow_up_story STATUS_UPDATE=review
```

## Best Use

Start with `review-squad:experts` for launch readiness or codebase risk. It
detects the project type, proposes a focused expert panel, waits for your
approval or customization, dispatches read-only reviewers, and consolidates
findings by severity. After the report, ask it for an implementation plan before
making code changes.

During panel selection, `experts` also checks for optional lane signals such as
BMAD/story workflow files, release automation, dependency/license risk, developer
experience changes, and broad architecture shifts. Strong matches appear as
candidate lanes; weaker matches appear as related expert suggestions so you know
which additional reviewers are available before approving the panel.

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
| `review-squad:normies` | "Do first-time visitors understand this?" | Sequential browser personas |
| `review-squad:regulars` | "Can real users complete key flows?" | Sequential browser task attempts |
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

- Keep panels small enough to finish: 4-8 experts or 4-6 browser personas.
- Customize the proposed panel for your actual audience and stack.
- Let `experts` use `medium` reasoning effort by default. Reserve `high` for
  security, reliability, architecture, data integrity, or very complex reviews.
- Give browser modes a specific URL and make sure the dev server is already up.
- Give `regulars` explicit flows if you know which ones matter.
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
