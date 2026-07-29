# Codex Review Squad maintenance contract

- The repository root owns marketplace metadata, release documentation,
  development dependencies, tests, and versioned plans. The installable bundle
  is `plugins/review-squad/`; it must work when copied without any ancestor
  files or `node_modules`.
- Treat `plugins/review-squad/references/review-catalog.json` as the canonical
  mode/project/lane catalog and `review-report.schema.json` as the canonical
  report contract. Version-specific decisions belong in their plan under
  `docs/plans/`, not here.
- Author one JSON report, validate schema plus semantic invariants, then render
  Markdown deterministically. JSON is the source of truth; do not independently
  author or retain derived Markdown as evidence.
- Preserve the prompt-scoped report artifact policy: explicit `inline_only`
  wins; an explicitly approved absolute report directory overrides the default
  target `/.review-squad/reports/`; otherwise fall back to `inline_only` when no
  appropriate writable target exists. Never auto-edit a reviewed target's
  `.gitignore`.
- Invoke installed runtime only through absolute paths resolved from the loaded
  plugin skill/reference location. Never execute a same-named script from the
  reviewed target. Commit reproducible standalone bundles under
  `plugins/review-squad/scripts/runtime/`; keep their build dependencies at the
  repository root as exact development pins.
- Production workflows must continue resolving bundled runtime paths from their
  actually loaded skill/reference location. The RG-07 installer gate may instead
  use the exact `installedPath` in the machine-readable `codex plugin add --json`
  receipt after cross-checking its real path, manifest identity/cachebuster,
  installed files, fresh-session discovery, and absolute runtime execution.
- Keep every `SKILL.md` concise and imperative. Put schemas, catalogs, detailed
  procedures, generated runtime, and fixtures in references, scripts, or tests.
  Load only the references relevant to the active mode.
- Preserve unrelated work. Keep at most one implementation writer active.
  Every delegated write must identify allowed files, forbidden files,
  acceptance criteria, and an evidence-based handoff.
- Run `pnpm install --frozen-lockfile`, `npm run check:runtime`, `npm test`,
  `npm run validate`, `npm run validate:catalog`, and `npm run eval:check` for a
  release integration. Also run plugin-creator validation, skill-creator
  validation for all five skills, and `git diff --check`. Inspect guarded gate
  procedures with `verify-real-browser.mjs --plan`,
  `verify-installed-plugin.mjs --plan`, `run-evaluation.mjs --pilot-plan`, and
  `run-evaluation.mjs --plan`; plan output is never pass evidence, and pilot
  execution is harness compatibility evidence rather than RG-04/RG-05 evidence.
- Keep the root package, plugin manifest, report generator, fixtures, and
  documentation on the intended release version. A Codex cachebuster is local
  installation metadata only: replace one suffix during authorized testing and
  never commit it as the release version.
- Store canonical review/evaluation evidence under versioned `docs/` or test
  evidence paths. Ignore root `/.review-squad/`; generate Markdown from tracked
  JSON when needed. Do not commit transient browser, cache, or installed-plugin
  output.
- Do not publish, push, tag, reinstall plugins, mutate marketplaces, run
  downloaded browser software, or cross an externally visible browser action
  without explicit authorization. Report unexecuted release gates as
  `not_verified`, never as passing smoke evidence.
