# Review Squad Panels

Load this file when proposing a Review Squad panel. Keep the proposed panel
small enough to run well, then suggest project-specific additions. Do not hide
known relevant experts: add strong matches as candidate lanes, and list weaker
matches as related expert suggestions with the signal that triggered them.

## Project Detection

Inspect the repository before proposing a panel:

- `package.json`, `vite.config.*`, `next.config.*`, `astro.config.*`,
  `src/app`, `pages`, `public`, `index.html`: web app or site
- `openapi.*`, `swagger.*`, `routes`, `controllers`, `api`, `server`,
  `FastAPI`, `Express`, `Rails`, `Django`: API or backend service
- `ios`, `android`, `react-native`, `Expo`, `Swift`, `Kotlin`, `Flutter`:
  mobile app
- `bin`, `cmd`, `cli`, `argparse`, `commander`, `cobra`, `click`: CLI tool
- `dbt`, `airflow`, `dagster`, `spark`, `notebooks`, `pipelines`: data
  pipeline
- `bmad`, `BMAD`, `story-run`, `story-runner`, `stories`, `Story`, `AC`,
  `acceptance criteria`, `tools/bmad-loop.config.json`: BMAD or story-driven
  delivery workflow

If the repository mixes types, choose the user-facing product surface first
and add targeted reviewers for the other surfaces.

## Expert Panels

### Web

- SEO reviewer: metadata, headings, canonical URLs, sitemap, robots, structured data
- Accessibility reviewer: semantics, keyboard use, contrast, motion, ARIA
- Mobile UX reviewer: responsive layout, touch targets, viewport, overflow
- Performance reviewer: bundle size, image/font delivery, caching, hydration
- Security reviewer: headers, XSS surfaces, secrets, CORS, link security
- Copy editor: spelling, grammar, tone, calls to action, empty states
- Social preview reviewer: OpenGraph, cards, favicon, share images
- Web standards reviewer: valid HTML, platform APIs, progressive enhancement

### API Or Backend

- API design reviewer: resource naming, versioning, pagination, errors
- Security reviewer: authentication, authorization, validation, rate limiting
- Performance reviewer: database access, payloads, caching, N+1 risks
- Reliability reviewer: timeouts, retries, idempotency, graceful degradation
- Documentation reviewer: OpenAPI, examples, error docs, client guidance
- Data model reviewer: schema, migrations, constraints, indexes

### Mobile App

- UX reviewer: navigation, onboarding, platform conventions, gestures
- Accessibility reviewer: screen reader labels, dynamic type, contrast, targets
- Performance reviewer: startup, memory, battery, network, image handling
- Security reviewer: local storage, secrets, auth/session handling
- Store compliance reviewer: permissions, privacy, review guidelines
- Copy/localization reviewer: UI text, errors, translation readiness

### CLI Tool

- CLI ergonomics reviewer: commands, flags, help text, examples, output
- Error handling reviewer: exit codes, diagnostics, edge cases
- Compatibility reviewer: shells, OS paths, terminals, encodings
- Security reviewer: input handling, credentials, file permissions
- Documentation reviewer: README, man page, recipes, migration notes

## Expert Suggestion Catalog

Use these lanes to avoid silent omissions during panel selection. If a signal is
present and the lane is not in the default panel, include it in `Candidate Lanes`
when it is likely to improve the review. If it is only tangential, list it under
`Related Expert Suggestions` so the user knows it exists.

- BMAD workflow reviewer: story status, acceptance criteria traceability,
  implementation evidence, `story-run`/decision command fit, follow-up story
  boundaries. Trigger on BMAD files, story docs, `tools/bmad-loop.config.json`,
  `make story-run*` targets, acceptance criteria, or explicit story IDs. Use as
  a standard or high-priority lane when BMAD lifecycle correctness is part of
  the user's stated goal; otherwise suggest it as a candidate. Do not treat a
  generic validation or test lane as a substitute for naming this lane when BMAD
  signals are present.
- Release/CI reviewer: workflow files, release scripts, artifact publishing,
  versioning, branch protection assumptions. Trigger on `.github/workflows`,
  release manifests, changelog automation, or packaging changes.
- Dependency/license reviewer: lockfiles, third-party licenses, dependency
  update policy, supply-chain risk. Trigger on dependency churn, missing
  lockfiles, generated SBOMs, or license-sensitive projects.
- Developer experience reviewer: setup docs, local scripts, test commands,
  environment variables, onboarding friction. Trigger on new tooling, changed
  Makefiles/scripts, dev containers, or multi-service local stacks.
- Architecture reviewer: module boundaries, layering, extensibility, coupling,
  long-term maintainability. Trigger on multi-module projects, broad refactors,
  new platform foundations, or cross-cutting abstractions.

## Normies Personas

- Senior developer: expert, low patience, notices jargon and broken trust signals
- Product manager: high sophistication, goal-oriented, wants the value fast
- College student: visually driven, low patience, scans and bounces quickly
- Small business owner: practical, busy, wants the answer now
- Retired teacher: careful reader, low technical vocabulary, patient until lost
- Grandparent: minimal web assumptions, icons and jargon are not self-explanatory

Suggest audience-specific additions: junior developer for developer tools,
hungry mobile visitor for restaurants, donor for nonprofits, buyer for stores.

## Regulars Task Examples

Personal site or blog:

- Recruiter finds what the person does and how to contact them
- Reader finds and reads a post on a topic
- RSS subscriber finds the feed
- Social visitor lands on a shared post and explores

SaaS or product site:

- Evaluator understands the product and finds pricing
- Trial user starts signup
- Support seeker finds docs or help
- Enterprise buyer finds contact sales
- Developer finds API docs or integrations

E-commerce:

- Gift shopper finds an item under a budget and starts checkout
- Comparison shopper filters, sorts, and compares products
- Return visitor finds order status or return policy
- Coupon user applies a discount code

## Well-Actually Panel

- Typographer: font pairing, line height, rhythm, orphans, widows
- Grammarian: punctuation, capitalization, grammar, tone consistency
- Standards zealot: semantics, DOM validity, ARIA correctness, templates
- Hacker News commenter: tech choices, bundle size, over-engineering, source
- Pixel cop: spacing, alignment, radius, color drift, responsive polish
- UX reply guy: hover states, affordances, transitions, click targets

Access rules:

| Persona | Browser | DOM | CSS | Source |
| --- | --- | --- | --- | --- |
| Typographer | yes | yes | yes | no |
| Grammarian | yes | no | no | no |
| Standards zealot | yes | yes | no | templates only |
| Hacker News commenter | yes | yes | optional | yes |
| Pixel cop | yes | yes | yes | no |
| UX reply guy | yes | no | no | no |
