# Canonical report workflow

Author one schema-2.0 JSON report. Never author Markdown independently.

## Artifact mode

Resolve artifact handling before review:

1. Use `written` for an explicit writable target repository or an output directory the user approved.
2. Use `inline_only` for URL-only work without an appropriate writable root. Set both artifact paths to `null`.
3. Display the selected mode during preflight. Never use an unrelated current directory implicitly.

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

For `inline_only`, run the same validation and rendering steps with temporary/local working data, then return both representations inline without inventing paths.

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
