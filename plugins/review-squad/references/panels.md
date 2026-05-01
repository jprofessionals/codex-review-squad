# Review Squad Panels

Load this file when proposing a Review Squad panel. Keep the proposed panel
small enough to run well, then suggest project-specific additions.

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
