---
name: review-squad
description: Route Review Squad requests to experts, normies, regulars, or well-actually based on the user's review goal.
---

# Review Squad Router

Use this skill when the user asks for Review Squad generally or is unsure which
mode they need.

Review Squad is a Codex adaptation of 2389 Research's MIT-licensed
`review-squad` plugin. It offers four modes:

- `review-squad:experts`: production-ready multi-perspective project audit.
- `review-squad:normies`: first-time visitor impressions across a sophistication spectrum.
- `review-squad:regulars`: browser-based task completion smoke review.
- `review-squad:well-actually`: nitpicky polish and pedantic feedback.

## Routing

Choose the mode from the user's intent:

- Launch readiness, codebase health, SEO, accessibility, security, performance:
  use `experts`.
- "Do people understand this?", first impressions, landing page clarity:
  use `normies`.
- "Can users complete these flows?", smoke tests, signup, checkout, search:
  use `regulars`.
- Nitpicks, polish, roast, Hacker News-style feedback, grammar/typography:
  use `well-actually`.

If the request clearly maps to one mode, proceed with that mode. If it asks for
several modes, run them in this order: `experts`, `regulars`, `normies`,
`well-actually`, unless the user states a different priority.

If the target is browser-only and no URL is provided, ask for the URL or offer
to start the local dev server if that fits the repository.

Keep router output short: name the selected mode, explain why in one sentence,
then follow that skill's workflow.
