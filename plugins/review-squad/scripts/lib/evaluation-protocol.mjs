import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const EVALUATION_PHASES = ["controlled_quality", "production_behavior"];

export function assessAmbientReviewSquadIsolation(final) {
  const inventory = final?.ambient_review_squad;
  const locators = Array.isArray(inventory?.skill_locators) ? inventory.skill_locators : [];
  const sourceVerified = inventory?.inventory_source === "system_available_skills";
  return {
    status: sourceVerified && locators.length === 0 ? "verified" : "not_verified",
    inventory_source: inventory?.inventory_source ?? "missing",
    ambient_skill_locators: locators,
    reason: sourceVerified && locators.length === 0 ? null : "ambient Review Squad skill absence was not proven from the system-provided Available Skills inventory"
  };
}

export function pilotCompatibilityVerdict({events, delegations, delegationMapping, ambientIsolation, laneResults, usageStatus, expectedDelegations = 3}) {
  const callIds = delegations.map(({call_id}) => call_id);
  const links = Array.isArray(delegationMapping?.links) ? delegationMapping.links : [];
  const linkedCallIds = links.map(({delegation_call_id}) => delegation_call_id);
  const returnedIdentities = links.map(({observed_identity}) => observed_identity);
  const identitiesVerified = callIds.length === expectedDelegations
    && callIds.every(Boolean)
    && new Set(callIds).size === expectedDelegations
    && links.length === expectedDelegations
    && links.every(({verified}) => verified === true)
    && new Set(linkedCallIds).size === expectedDelegations
    && callIds.every((callId) => linkedCallIds.includes(callId))
    && returnedIdentities.every(Boolean)
    && new Set(returnedIdentities).size === expectedDelegations
    && delegationMapping?.identities_unique === true;
  const rawArtifactVerified = typeof delegationMapping?.raw_artifact === "string"
    && /^[a-f0-9]{64}$/.test(delegationMapping?.raw_artifact_sha256 ?? "");
  const rawProvenanceVerified = delegationMapping?.status === "verified"
    && delegationMapping?.raw_payload_provenance === "verified"
    && rawArtifactVerified;
  const rawLanesVerified = laneResults.length === expectedDelegations && laneResults.every((lane) => Array.isArray(lane.raw_findings));
  const checks = {
    jsonl_shape: events.some(({type}) => type === "turn.completed") ? "verified" : "not_verified",
    delegation_mapping: delegationMapping?.status ?? "not_verified",
    top_level_delegation_identities: identitiesVerified ? "verified" : "not_verified",
    top_level_delegation_call_ids: callIds,
    top_level_returned_identities: returnedIdentities,
    raw_delegated_payload_provenance: rawProvenanceVerified ? "verified" : "not_verified",
    ambient_review_squad_isolation: ambientIsolation.status,
    ambient_review_squad_skill_locators: ambientIsolation.ambient_skill_locators,
    raw_lane_retention: rawLanesVerified ? "verified" : "not_verified",
    final_response_parsing: "verified",
    usage_capture: usageStatus
  };
  const required = [checks.jsonl_shape, checks.delegation_mapping, checks.top_level_delegation_identities, checks.raw_delegated_payload_provenance, checks.ambient_review_squad_isolation, checks.raw_lane_retention];
  return {status: required.every((value) => value === "verified") ? "pilot_passed_non_release" : "completed_not_verified", checks};
}

export function validatePilotPrerequisiteRecord(pilot, expectedFingerprint, {evidenceFile = null} = {}) {
  assert.equal(pilot.mode, "pilot", "pilot evidence has the wrong mode");
  assert.equal(pilot.status, "pilot_passed_non_release", "pilot evidence is not a compatible successful pilot");
  assert.deepEqual(pilot.protocol_fingerprint, expectedFingerprint, "pilot evidence does not match the current protocol hashes");
  assert.equal(pilot.pilot_checks?.delegation_mapping, "verified", "pilot delegation mapping is not verified");
  assert.equal(pilot.pilot_checks?.top_level_delegation_identities, "verified", "pilot top-level delegation identities are not verified");
  assert.equal(pilot.pilot_checks?.raw_delegated_payload_provenance, "verified", "pilot raw delegated payload provenance is not verified");
  assert.equal(pilot.pilot_checks?.ambient_review_squad_isolation, "verified", "pilot ambient Review Squad isolation is not verified");
  assert.equal(pilot.calls?.length, 1, "pilot evidence must contain exactly one primary call");
  const call = pilot.calls[0];
  assert.equal(call.observed_delegated_calls, 3, "pilot did not observe exactly three top-level delegations");
  assert.equal(call.authorized_delegation_ceiling, 3, "pilot delegation ceiling differs from the compatible protocol");
  assert.equal(call.ambient_review_squad_isolation?.status, "verified", "pilot call ambient Review Squad isolation is not verified");
  const mapping = call.delegation_mapping;
  assert.equal(mapping?.status, "verified", "pilot call delegation mapping is not verified");
  assert.equal(mapping?.raw_payload_provenance, "verified", "pilot call raw payload provenance is not verified");
  assert.equal(mapping?.links?.length, 3, "pilot call must retain exactly three delegation links");
  assert(mapping.links.every(({verified}) => verified === true), "pilot call contains an unverified delegation link");
  const callIds = mapping.links.map(({delegation_call_id}) => delegation_call_id);
  const identities = mapping.links.map(({observed_identity}) => observed_identity);
  assert(callIds.every(Boolean) && new Set(callIds).size === 3, "pilot delegation call IDs are missing or duplicated");
  assert(identities.every(Boolean) && new Set(identities).size === 3, "pilot returned delegation identities are missing or duplicated");
  assert(typeof mapping.raw_artifact === "string" && mapping.raw_artifact, "pilot raw delegation artifact path is missing");
  assert(/^[a-f0-9]{64}$/.test(mapping.raw_artifact_sha256 ?? ""), "pilot raw delegation artifact SHA-256 is missing or malformed");
  let rawDelegationArtifact = null;
  if (evidenceFile !== null) {
    const evidenceRoot = path.dirname(path.resolve(evidenceFile));
    rawDelegationArtifact = path.resolve(mapping.raw_artifact);
    assert(rawDelegationArtifact.startsWith(`${evidenceRoot}${path.sep}`), "pilot raw delegation artifact is outside its evidence directory");
    assert(fs.existsSync(rawDelegationArtifact) && fs.statSync(rawDelegationArtifact).isFile(), "pilot raw delegation artifact is missing");
    const observedHash = crypto.createHash("sha256").update(fs.readFileSync(rawDelegationArtifact)).digest("hex");
    assert.equal(observedHash, mapping.raw_artifact_sha256, "pilot raw delegation artifact hash mismatch");
  }
  return {status: "validated_before_full_run", raw_delegation_artifact: rawDelegationArtifact};
}

export const PRODUCTION_CONTRACTS = {
  "v0.2.3": {
    minimum_lanes: 4,
    maximum_lanes: 8,
    dispatch: "shipped default panel of 4-8 reviewers",
    tier_policy: "shipped v0.2.3 effort policy; medium by default and high/low only where its instructions require"
  },
  "v0.3.0": {
    minimum_lanes: 3,
    maximum_lanes: 5,
    dispatch: "three evidence-selected initial lanes with evidence-based escalation capped at five",
    tier_policy: "shipped v0.3.0 Sol/high, Terra/medium, and Terra/low lane policy"
  }
};

export function findingIdentity({phase, call_id, case_id, finding_index}) {
  assert(EVALUATION_PHASES.includes(phase), `unknown phase ${phase}`);
  assert(typeof call_id === "string" && call_id, "call_id is required");
  assert(typeof case_id === "string" && case_id, "case_id is required");
  assert(Number.isInteger(finding_index) && finding_index >= 0, "finding_index must be non-negative");
  return `${phase}\u0000${call_id}\u0000${case_id}\u0000${finding_index}`;
}

export function flattenReviewFindings(reviewOutputs) {
  const flattened = [];
  for (const output of reviewOutputs) {
    if (output.phase === "controlled_quality") {
      for (const caseResult of output.final.case_results) {
        caseResult.findings.forEach((finding, finding_index) => flattened.push({
          phase: output.phase, call_id: output.call_id, case_id: caseResult.case_id, finding_index, lane_id: null, subject: output.subject, finding
        }));
      }
      continue;
    }
    assert.equal(output.phase, "production_behavior");
    let finding_index = 0;
    for (const lane of output.final.lane_results) {
      for (const finding of lane.raw_findings) {
        flattened.push({phase: output.phase, call_id: output.call_id, case_id: output.final.case_id, finding_index, lane_id: lane.lane_id, subject: output.subject, finding});
        finding_index += 1;
      }
    }
  }
  return flattened;
}

export function validateControlledCaseCoverage(final, allocatedCaseIds) {
  const expected = [...allocatedCaseIds].sort();
  const actual = final.case_results.map(({case_id}) => case_id);
  const counts = new Map(actual.map((caseId) => [caseId, (actual.filter((value) => value === caseId).length)]));
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([caseId]) => caseId).sort();
  const unallocated = [...new Set(actual.filter((caseId) => !allocatedCaseIds.includes(caseId)))].sort();
  const omitted = expected.filter((caseId) => !counts.has(caseId));
  assert.deepEqual(duplicates, [], `controlled response duplicated allocated cases: ${duplicates.join(", ")}`);
  assert.deepEqual(unallocated, [], `controlled response included unallocated cases: ${unallocated.join(", ")}`);
  assert.deepEqual(omitted, [], `controlled response omitted allocated cases: ${omitted.join(", ")}`);
  assert.equal(actual.length, allocatedCaseIds.length, "controlled response case count differs from immutable allocation");
  return expected;
}

function expectedByCase(expectations) {
  return new Map(Object.entries(expectations.cases));
}

export function validateScoringLedger({findings, ledger, expectations}) {
  const findingMap = new Map(findings.map((finding) => [findingIdentity(finding), finding]));
  assert.equal(findingMap.size, findings.length, "review finding identities collide across phase/call/case/index");
  const ledgerMap = new Map();
  const expectedCases = expectedByCase(expectations);
  for (const row of ledger) {
    const identity = findingIdentity(row);
    assert(!ledgerMap.has(identity), `duplicate scoring ledger row: ${identity}`);
    assert(findingMap.has(identity), `invented scoring ledger row: ${identity}`);
    const allowed = new Set((expectedCases.get(row.case_id)?.expected_findings ?? []).map(({id}) => id));
    allowed.add("unsupported");
    assert(allowed.has(row.root_id), `ledger root ${row.root_id} is not allowed for ${row.case_id}`);
    ledgerMap.set(identity, row);
  }
  const omitted = [...findingMap.keys()].filter((identity) => !ledgerMap.has(identity));
  assert.deepEqual(omitted, [], `scoring ledger omitted findings: ${omitted.join(", ")}`);
  return [...ledgerMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row);
}

function fraction(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function computeDeterministicMetrics({findings, ledger, expectations, reviewOutputs = []}) {
  const validLedger = validateScoringLedger({findings, ledger, expectations});
  const findingMap = new Map(findings.map((finding) => [findingIdentity(finding), finding]));
  const bySubjectPhase = new Map();
  for (const row of validLedger) {
    const finding = findingMap.get(findingIdentity(row));
    const subject = finding.subject;
    const key = `${row.phase}:${subject}`;
    const bucket = bySubjectPhase.get(key) ?? [];
    bucket.push({...row, finding: finding.finding, lane_id: finding.lane_id});
    bySubjectPhase.set(key, bucket);
  }
  const metrics = {};
  for (const phase of EVALUATION_PHASES) {
    metrics[phase] = {};
    for (const subject of ["v0.2.3", "v0.3.0"]) {
      const rows = bySubjectPhase.get(`${phase}:${subject}`) ?? [];
      const casesReviewed = new Set(reviewOutputs.filter((item) => item.phase === phase && item.subject === subject).flatMap((item) => item.phase === "controlled_quality" ? item.allocated_case_ids : [item.final.case_id]));
      const expected = [...casesReviewed].flatMap((caseId) => expectations.cases[caseId].expected_findings.map((item) => ({case_id: caseId, ...item})));
      const matched = new Set(rows.filter(({root_id}) => root_id !== "unsupported").map(({case_id, root_id}) => `${case_id}\u0000${root_id}`));
      const criticalImportant = expected.filter(({severity}) => severity === "critical" || severity === "important");
      const rawDuplicateGroups = new Map();
      const rawLaneComplete = phase !== "production_behavior" || reviewOutputs
        .filter((item) => item.phase === phase && item.subject === subject)
        .every((item) => item.delegation_mapping?.status === "verified"
          && item.delegation_mapping?.raw_payload_provenance === "verified"
          && /^[a-f0-9]{64}$/.test(item.delegation_mapping?.raw_artifact_sha256 ?? "")
          && item.delegation_mapping?.links?.length === item.final.lane_results.length
          && item.delegation_mapping.links.every(({verified}) => verified === true)
          && item.final.lane_results.every(({completion}) => completion === "completed"));
      if (phase === "production_behavior") {
        for (const row of rows.filter(({root_id}) => root_id !== "unsupported")) {
          const key = `${row.case_id}\u0000${row.root_id}`;
          rawDuplicateGroups.set(key, (rawDuplicateGroups.get(key) ?? 0) + 1);
        }
      }
      metrics[phase][subject] = {
        expected_root_count: expected.length,
        emitted_finding_count: rows.length,
        critical_important_recall: fraction(criticalImportant.filter(({case_id, id}) => matched.has(`${case_id}\u0000${id}`)).length, criticalImportant.length),
        all_severity_recall: fraction(expected.filter(({case_id, id}) => matched.has(`${case_id}\u0000${id}`)).length, expected.length),
        unsupported_critical_count: rows.filter(({root_id, finding}) => root_id === "unsupported" && finding.severity === "critical").length,
        evidence_validity_fraction: fraction(rows.filter(({evidence_valid}) => evidence_valid).length, rows.length),
        exact_severity_fraction: fraction(rows.filter(({severity_exact}) => severity_exact).length, rows.length),
        duplicate_metric_status: phase === "production_behavior" ? (rawLaneComplete ? "observed" : "not_verified") : "not_applicable",
        duplicate_instances_from_raw_lanes: phase === "production_behavior" && rawLaneComplete
          ? [...rawDuplicateGroups.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)
          : null
      };
    }
  }
  return metrics;
}

export function compareScoringLedgers(left, right) {
  const index = (ledger) => new Map(ledger.map((row) => [findingIdentity(row), row]));
  const leftMap = index(left);
  const rightMap = index(right);
  const identities = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort();
  const disagreements = [];
  for (const identity of identities) {
    const a = leftMap.get(identity) ?? null;
    const b = rightMap.get(identity) ?? null;
    const decision = (row) => row && {root_id: row.root_id, evidence_valid: row.evidence_valid, severity_exact: row.severity_exact};
    if (JSON.stringify(decision(a)) !== JSON.stringify(decision(b))) disagreements.push({identity, scorer_a: a, scorer_b: b});
  }
  return {agreed: disagreements.length === 0, disagreements};
}

export function usageFields(usage) {
  const empty = {input_tokens: null, cached_input_tokens: null, output_tokens: null, reasoning_output_tokens: null};
  if (!usage || typeof usage !== "object") {
    return {status: "not_verified", ...empty, field_status: Object.fromEntries(Object.keys(empty).map((field) => [field, "not_verified"]))};
  }
  const read = (...keys) => keys.map((key) => usage[key]).find(Number.isFinite) ?? null;
  const result = {
    status: "observed",
    input_tokens: read("input_tokens", "input"),
    cached_input_tokens: read("cached_input_tokens", "cached_input"),
    output_tokens: read("output_tokens", "output"),
    reasoning_output_tokens: read("reasoning_output_tokens", "reasoning_output")
  };
  if (Object.keys(empty).every((field) => result[field] === null)) result.status = "not_verified";
  result.field_status = Object.fromEntries(Object.keys(empty).map((field) => [field, Number.isFinite(result[field]) ? "observed" : "not_verified"]));
  return result;
}

function toolRecord(value) {
  if (!value || typeof value !== "object") return null;
  for (const key of ["tool_name", "name", "tool"]) {
    if (value[key] === "spawn_agent") return {id: value.id ?? value.call_id ?? null, value};
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = toolRecord(child);
      if (found) return found;
    }
  }
  return null;
}

export function delegationEvents(events) {
  const observed = [];
  const byIdentity = new Map();
  events.forEach((event, eventIndex) => {
    const record = toolRecord(event);
    if (!record) return;
    const identity = record.id ?? `event:${eventIndex}`;
    const findString = (value, keys) => {
      if (!value || typeof value !== "object") return null;
      for (const [key, child] of Object.entries(value)) {
        if (keys.includes(key) && typeof child === "string" && child) return child;
        const nested = findString(child, keys);
        if (nested) return nested;
      }
      return null;
    };
    const current = byIdentity.get(identity);
    const next = {
      call_id: record.id,
      event_index: eventIndex,
      event_type: event.type ?? null,
      task_name: findString(record.value, ["task_name", "task"]),
      returned_agent_id: findString(record.value, ["agent_id", "agentId", "target"]),
      raw_response: record.value.result ?? record.value.output ?? null,
      raw_events: [...(current?.raw_events ?? []), event]
    };
    if (current) {
      for (const [key, value] of Object.entries(next)) if (value !== null) current[key] = value;
    } else {
      byIdentity.set(identity, next);
      observed.push(next);
    }
  });
  return observed;
}

export function assessDelegationObservation({delegations, laneResults, minimum, maximum, allowUnobservable = false}) {
  assert(Array.isArray(delegations), "delegation events must be an array");
  assert(Array.isArray(laneResults), "lane_results must be an array");
  assert(delegations.length <= maximum, `observed ${delegations.length} delegation calls; authorized ceiling is ${maximum}`);
  if (!allowUnobservable) {
    assert(delegations.length >= minimum, `observed ${delegations.length} delegation calls; expected ${minimum}-${maximum}`);
    assert.equal(laneResults.length, delegations.length, "lane_results do not preserve every observed delegated call");
    assert.equal(new Set(laneResults.map(({lane_id}) => lane_id)).size, laneResults.length, "lane identities are not unique");
  }
  return linkDelegationResults(delegations, laneResults);
}

export function linkDelegationResults(delegations, laneResults) {
  const observedIds = delegations.map(({call_id}) => call_id);
  const laneIds = laneResults.map(({delegation_call_id}) => delegation_call_id);
  if (observedIds.some((id) => !id) || laneIds.some((id) => !id)) {
    return {status: "not_verified", reason: "Codex JSONL or lane output did not expose a stable delegation_call_id for every lane", observed_call_ids: observedIds, lane_call_ids: laneIds};
  }
  if (new Set(observedIds).size !== observedIds.length || new Set(laneIds).size !== laneIds.length) {
    return {status: "not_verified", reason: "observed or lane delegation call IDs are duplicated", observed_call_ids: observedIds, lane_call_ids: laneIds};
  }
  const missingLane = observedIds.filter((id) => !laneIds.includes(id));
  const inventedLane = laneIds.filter((id) => !observedIds.includes(id));
  if (missingLane.length || inventedLane.length) {
    return {status: "not_verified", reason: "delegations and lane_results are not one-to-one", missing_lane_call_ids: missingLane, invented_lane_call_ids: inventedLane};
  }
  const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    return value;
  };
  const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
  const findRawFindings = (value) => {
    if (typeof value === "string") {
      try { return findRawFindings(JSON.parse(value)); } catch { return null; }
    }
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value.raw_findings)) return value.raw_findings;
    if (Array.isArray(value.findings)) return value.findings;
    for (const child of Object.values(value)) {
      const found = findRawFindings(child);
      if (found) return found;
    }
    return null;
  };
  const links = observedIds.sort().map((callId) => {
    const observed = delegations.find((item) => item.call_id === callId);
    const lane = laneResults.find((item) => item.delegation_call_id === callId);
    const observedIdentity = observed.returned_agent_id ?? observed.task_name ?? null;
    const laneIdentity = lane.returned_agent_id ?? lane.returned_task_name ?? null;
    const retainedFindings = findRawFindings(observed.raw_response);
    const checks = {
      observed_identity_present: Boolean(observedIdentity),
      lane_identity_matches: Boolean(observedIdentity) && laneIdentity === observedIdentity,
      retained_raw_response_present: observed.raw_response !== null && observed.raw_response !== undefined,
      parent_raw_response_matches: observed.raw_response !== null && lane.raw_delegated_response !== null && equal(lane.raw_delegated_response, observed.raw_response),
      retained_findings_extractable: Array.isArray(retainedFindings),
      parent_raw_findings_match: Array.isArray(retainedFindings) && equal(lane.raw_findings, retainedFindings)
    };
    return {delegation_call_id: callId, lane_id: lane.lane_id, observed_identity: observedIdentity, lane_identity: laneIdentity, checks, verified: Object.values(checks).every(Boolean)};
  });
  const identities = links.map(({observed_identity}) => observed_identity);
  const identitiesUnique = identities.every(Boolean) && new Set(identities).size === identities.length;
  if (!identitiesUnique || links.some(({verified}) => !verified)) {
    return {status: "not_verified", reason: "delegation identity or untouched raw delegated payload provenance could not be verified", identities_unique: identitiesUnique, links};
  }
  return {status: "verified", identities_unique: true, raw_payload_provenance: "verified", links};
}

function delegatedUsageEvents(events) {
  const records = [];
  const visit = (value, eventIndex, inheritedCallId = null) => {
    if (!value || typeof value !== "object") return;
    const localCallId = value.delegation_call_id ?? value.call_id ?? value.tool_call_id ?? inheritedCallId;
    for (const [key, child] of Object.entries(value)) {
      if (key === "delegated_usage" && child && typeof child === "object") {
        records.push({event_index: eventIndex, delegation_call_id: child.delegation_call_id ?? child.call_id ?? child.tool_call_id ?? localCallId ?? null, usage: child.usage ?? child});
      } else {
        visit(child, eventIndex, localCallId);
      }
    }
  };
  events.forEach((event, eventIndex) => visit(event, eventIndex));
  return records;
}

export function classifyTokenAccounting(events, delegations = delegationEvents(events)) {
  const completed = events.map((event, event_index) => ({event, event_index})).filter(({event}) => event.type === "turn.completed");
  const support = completed.map(({event_index, event}) => ({event_index, usage: event.usage ?? null, usage_scope: event.usage_scope ?? event.usage?.scope ?? null, includes_delegated: event.usage?.includes_delegated ?? event.includes_delegated ?? null}));
  if (support.some(({usage_scope, includes_delegated}) => includes_delegated === true || ["aggregate", "aggregate_including_delegated"].includes(usage_scope))) {
    return {classification: "aggregate_including_delegated", status: "verified", supporting_events: support};
  }
  if (support.some(({usage_scope, includes_delegated}) => includes_delegated === false || usage_scope === "primary_only")) {
    return {classification: "primary_only", status: "verified", supporting_events: support};
  }
  const delegatedUsage = delegatedUsageEvents(events);
  const delegationIds = delegations.map(({call_id}) => call_id);
  const usageIds = delegatedUsage.map(({delegation_call_id}) => delegation_call_id);
  const identitiesVerified = delegationIds.length > 0
    && delegationIds.every(Boolean)
    && usageIds.every(Boolean)
    && new Set(delegationIds).size === delegationIds.length
    && new Set(usageIds).size === usageIds.length
    && delegationIds.length === usageIds.length
    && delegationIds.every((callId) => usageIds.includes(callId));
  if (identitiesVerified && support.some(({usage}) => usageFields(usage).status === "observed")) {
    return {classification: "primary_plus_independently_exposed_delegated", status: "verified", supporting_events: support, delegated_usage_identity_mapping: "verified", delegated_usage_events: delegatedUsage};
  }
  return {classification: "semantically_unknown", status: "not_verified", reason: "delegated usage lacks a stable one-to-one delegation_call_id mapping", supporting_events: support, observed_delegation_count: delegations.length, delegation_call_ids: delegationIds, delegated_usage_call_ids: usageIds, delegated_usage_events: delegatedUsage};
}
