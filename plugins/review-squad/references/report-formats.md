# Canonical report workflow

Author one schema-2.0 JSON report. Never author Markdown independently.

## Artifact policy

Resolve and display report artifact handling before review or persona dispatch.
Use this precedence:

1. An explicit `inline_only` request, including "do not save/write report
   files", always wins. Write no report files and set both artifact paths to
   `null`, even when the target is writable.
2. An explicitly approved absolute report directory uses `written` and writes
   the report pair directly there. Do not treat approval of report output as
   approval for browser artifacts or any other write.
3. Otherwise, an explicit writable target repository uses `written` under
   `<target>/.review-squad/reports/`.
4. Otherwise use `inline_only`. Never write into an unrelated current
   directory or infer approval from the working directory.

The user-facing prompt controls are:

```text
Report artifacts: inline_only
```

or:

```text
Report artifacts: written
Report artifact directory: /absolute/approved/path
```

Omitting both keeps the default behavior above. A relative, unavailable, or
unapproved requested directory is an artifact-policy error: explain it and ask
for a valid choice instead of silently falling back or writing elsewhere.

For written artifacts, use one stem for both files:

```text
.review-squad/reports/<timestamp>-<mode>[-<label>...].json
.review-squad/reports/<timestamp>-<mode>[-<label>...].md
```

## Author, validate, render

Resolve `PLUGIN_ROOT` from the absolute path of this loaded reference: it is the
parent of the `references/` directory containing this file. Never derive it
from the current working directory, search the reviewed target for scripts, or
run a target-owned same-named command.

1. Author JSON against `review-report.schema.json` with `schema_version: "2.0"`.
2. Record verified findings only when each has non-empty evidence and source attribution. Put unverified claims in `not_verified`.
3. Derive all summary counts from the arrays. Keep `mode_data.type`, `mode`, and `generator.skill` consistent.
4. Validate before presenting or writing Markdown:

```bash
node "$PLUGIN_ROOT/scripts/runtime/review-runtime.mjs" validate <report.json>
```

5. Generate Markdown only from the validated JSON:

```bash
node "$PLUGIN_ROOT/scripts/runtime/review-runtime.mjs" render <report.json> --output <report.md>
```

For `inline_only`, use a unique OS-temporary scratch directory outside the
reviewed target, run the same validation and rendering steps, return both
representations inline without inventing artifact paths, and remove the scratch
files afterward. If cleanup fails, report the retained path explicitly.

In `written` mode, keep the final chat response compact: summarize the verdict,
counts, and next move, then report the absolute JSON and Markdown paths plus
their SHA-256 hashes. Do not repeat either full report in chat unless the user
asks. Subagents return evidence to the parent; only the parent authors the
canonical report pair.

Written reports are not deleted automatically. Teams may archive, compare,
version, or delete them according to their own retention policy.

## Core boundaries

- Use only `critical`, `important`, and `minor` for verified findings.
- Keep `not_verified` separate from severity.
- Use the optional workflow-neutral `decision` object for an owner question, consequence, and recommendation.
- Do not add BMAD placeholders or sections to a generic report.
- When BMAD is active and meaningful data exists, follow `bmad-detection.md` and emit only `extensions.bmad` schema version `1.0`.
- Unknown extensions must not change core field meaning.

The JSON Schema defines detailed field shapes. The installed runtime bundles
add count, source, evidence, mode, artifact, and known-extension invariants and
are the only canonical validators/renderers. They contain their runtime
dependencies and do not use ancestor `node_modules`.

## Legacy input

Schema 1.1 is read-only migration input at `schemas/review-report.v1.1.schema.json`:

```bash
node "$PLUGIN_ROOT/scripts/runtime/review-runtime.mjs" migrate <legacy.json> --output <report-v2.json>
```

Migration drops negative/null BMAD boilerplate, moves meaningful BMAD commands into `extensions.bmad`, and fails with a field-specific diagnostic when legacy data cannot satisfy schema 2.0.
