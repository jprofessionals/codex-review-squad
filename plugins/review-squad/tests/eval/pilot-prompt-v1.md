# Review Squad harness pilot v1

Exercise the supplied v0.3.0 `review-squad:experts` subject against the one
supplied blinded target. Dispatch exactly its three initial evidence-selected
lanes and do not escalate. Read only; do not browse or edit.
Exactly three total `spawn_agent` calls are allowed. Failed calls count; do not
retry or replace a lane, and instruct every delegated lane not to delegate.

Inspect the system-provided Available Skills inventory before dispatch. Return
`ambient_review_squad.inventory_source` as `system_available_skills` only when
that inventory is exposed, otherwise `not_exposed`, plus every locator for an
ambient installed Review Squad skill. The inline subject is not ambient.

Preserve each delegated result before consolidation in `lane_results`, including
lane identity, completion/failure state, raw findings/evidence/severity, and
delegation call ID, returned agent/task identity, exact raw response, and
requested/observed model and effort when available. Use null for runtime data
the JSONL does not expose. Keep the parent
`consolidated_findings` separate. Return only the required JSON.
The raw response must be the untouched delegated output, and `raw_findings`
must match the findings extractable from that exact output; do not reconstruct
either field in the parent.

This is a harness pilot, not release evidence and not a nested-delegation
observability probe. Do not open or infer the oracle,
score findings, or make RG-04/RG-05 claims.
