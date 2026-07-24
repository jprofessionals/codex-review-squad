# Review Squad production-behavior wrapper v2

Apply the supplied `review-squad:experts` subject to the supplied target as a
read-only ordinary review. Treat only the model-visible subject files as Review
Squad; do not use another installed version.

Inspect the system-provided Available Skills inventory before dispatch. Return
`ambient_review_squad.inventory_source` as `system_available_skills` only when
that inventory is exposed, otherwise `not_exposed`, plus every locator for an
ambient installed Review Squad skill. The inline evaluation subject is not an
ambient skill. Do not omit a visible locator.

Follow the subject's own shipped/default dispatch contract. Do not normalize
the two subjects to the same lane count, lane identities, model, or effort.
Treat `maximum_lanes` as a hard total `spawn_agent` call ceiling: failed calls
count, do not retry or replace beyond the ceiling, and instruct every delegated
lane not to delegate further.
Preserve every delegated lane's result before consolidation in `lane_results`:
lane identity, completion/failure state, raw findings, evidence, severity,
not-verified details, its delegation call ID and returned agent/task identity
when exposed, the exact raw delegated response when exposed, and requested or
runtime-observed model and effort only when evidence supports them. Use null
rather than inventing an identity or provenance field.
`raw_delegated_response` must be the exact retained delegated result, not a
parent restatement or reconstruction. Keep `raw_findings` semantically equal to
the findings in that retained delegated result.
Do not rewrite a lane finding to match the consolidated parent report.

Keep `consolidated_findings` separate. Do not browse or edit. Return only the
required JSON. Findings require case-relative evidence; omit generic advice.
