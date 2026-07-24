# BMAD detection and activation

Confirm installation only from one recognized root and its parseable manifest:

- Modern: `_bmad/` plus `_bmad/_config/manifest.yaml`
- Legacy: `.bmad-core/` plus `.bmad-core/install-manifest.yaml`

The manifest must be a mapping with recognizable installation or module metadata. Prefer a confirmed modern installation; use confirmed legacy only when modern is not confirmed. Malformed manifests produce a diagnostic and never confirm or activate that candidate.

Supporting paths such as `_bmad-output/`, `.claude/commands/BMad/`, `_bmad/config.toml`, or module directories may show relevance but never confirm installation alone.

Use these states:

- `absent`: no confirmed installation; omit BMAD prompts, lanes, fields, sections, and commands.
- `installed_inactive`: installation confirmed but current review has no BMAD scope; do not emit the extension.
- `active`: BMAD was requested or the scope contains a story, acceptance criteria, lifecycle command, relevant configuration change, or generated BMAD artifact.

Emit `extensions.bmad` only for an active review with meaningful installation, lifecycle, decision, or diagnostic data. Validate it against `extensions/bmad/review-report-bmad.v1.schema.json`.

`scripts/lib/detection.mjs` is the deterministic reference implementation used by fixtures.
