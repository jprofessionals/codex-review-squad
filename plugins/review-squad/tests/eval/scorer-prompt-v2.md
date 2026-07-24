# Review Squad independent scorer v2

Map every supplied finding identity to exactly one root ID declared for that
finding's case, or to `unsupported`. Do not add, omit, or duplicate findings.
Copy `phase`, `call_id`, `case_id`, and `finding_index` exactly. Assess evidence
validity and exact severity independently from the other scorer.

Inspect the system-provided Available Skills inventory before scoring. Return
`ambient_review_squad.inventory_source` as `system_available_skills` only when
that inventory is exposed, otherwise `not_exposed`, plus every locator for an
ambient installed Review Squad skill. Do not omit a visible locator.

Return only the required object containing `scorer`, `ambient_review_squad`,
and the complete finding-to-root `ledger`. Do not calculate aggregate
metrics, duplicate totals, latency, token totals, or prices; the runner computes
all arithmetic deterministically after validating both ledgers.
