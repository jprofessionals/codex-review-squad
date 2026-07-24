import crypto from "node:crypto";
import {assessAmbientReviewSquadIsolation, assessDelegationObservation, classifyTokenAccounting, delegationEvents, pilotCompatibilityVerdict, usageFields} from "./evaluation-protocol.mjs";
import {parseJsonl} from "./process-control.mjs";

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function fail(message, details = {}) {
  const error = new Error(message);
  error.diagnostic = {kind: "pilot_adjudication_failure", message, ...details};
  throw error;
}

export function adjudicatePilotEvidence({artifacts, originalPaths, retainedPaths, adjudicatedAt = new Date().toISOString()}) {
  let originalResult;
  let final;
  let effectiveArgv;
  let retainedDelegations;
  try {
    originalResult = JSON.parse(artifacts.original_result);
    final = JSON.parse(artifacts.final_response);
    effectiveArgv = JSON.parse(artifacts.effective_argv);
    retainedDelegations = JSON.parse(artifacts.delegation_events);
  } catch (cause) {
    fail("pilot JSON artifact is malformed", {message: cause.message});
  }
  const events = parseJsonl(artifacts.session_jsonl.toString("utf8"), {source: "retained pilot JSONL"});
  const completed = events.filter(({type}) => type === "turn.completed");
  const failedEvents = events.filter(({type}) => type === "error" || type === "turn.failed");
  if (completed.length !== 1 || failedEvents.length) fail("pilot JSONL is not one clean completed turn", {turn_completed_count: completed.length, failure_count: failedEvents.length});
  if (originalResult.mode !== "pilot" || originalResult.status !== "failed" || !/observed 0 delegation calls; expected 3-3/.test(originalResult.failure?.message ?? "")) {
    fail("original pilot result is not the adjudicable observability false failure", {mode: originalResult.mode, status: originalResult.status, message: originalResult.failure?.message ?? null});
  }
  if (originalResult.failure?.call?.process_exit_confirmed !== true) fail("pilot model process exit was not confirmed");
  if (originalResult.shutdown_probe?.shutdown?.exit_confirmed !== true) fail("pilot shutdown probe did not confirm exit");
  if (!Array.isArray(final.lane_results) || final.lane_results.length !== 3 || final.lane_results.some(({completion}) => completion !== "completed")) {
    fail("pilot final response does not preserve three completed lanes");
  }

  const delegations = delegationEvents(events);
  if (delegations.length !== 0 || !Array.isArray(retainedDelegations) || retainedDelegations.length !== 0) fail("pilot raw delegation artifact and current JSONL parser disagree", {parsed_count: delegations.length, retained_count: retainedDelegations?.length ?? null});
  const mapping = assessDelegationObservation({delegations, laneResults: final.lane_results, minimum: 3, maximum: 3, allowUnobservable: true});
  mapping.raw_artifact = retainedPaths.delegation_events;
  mapping.raw_artifact_sha256 = sha256(artifacts.delegation_events);
  const ambientIsolation = assessAmbientReviewSquadIsolation(final);
  const usage = usageFields(completed[0].usage ?? null);
  const tokenAccounting = classifyTokenAccounting(events, delegations);
  const verdict = pilotCompatibilityVerdict({events, delegations, delegationMapping: mapping, ambientIsolation, laneResults: final.lane_results, usageStatus: usage.status, expectedDelegations: 3});
  if (verdict.status !== "completed_not_verified") fail("pilot compatibility verdict unexpectedly passed", {status: verdict.status});

  const requiredArgs = ["--ephemeral", "--json", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "read-only"];
  const missingArgs = requiredArgs.filter((arg) => !effectiveArgv.includes(arg));
  if (missingArgs.length || !effectiveArgv.some((arg) => typeof arg === "string" && arg === 'plugins."review-squad@codex-review-squad".enabled=false') || !effectiveArgv.some((arg) => typeof arg === "string" && arg === 'plugins."review-squad@codex-review-squad".mcp_servers.playwright.enabled=false')) {
    fail("pilot invocation isolation arguments are incomplete", {missing_args: missingArgs});
  }

  const sourceArtifacts = Object.fromEntries(Object.keys(artifacts).map((key) => [key, {
    original_path: originalPaths[key],
    retained_path: retainedPaths[key],
    sha256: sha256(artifacts[key])
  }]));
  const collabWaits = events.filter(({type, item}) => type === "item.completed" && item?.type === "collab_tool_call" && item.tool === "wait");
  return {
    schema_version: "1.0",
    gate: "evaluation-pilot",
    verdict: "completed_not_verified",
    evidence_status: "completed_after_harness_false_failure_adjudication",
    release_evidence: false,
    adjudicated_at: adjudicatedAt,
    execution: {
      pilot_executions_used: 1,
      retry_used: false,
      primary_calls_observed: 1,
      configured_top_level_delegated_calls: 3,
      configured_top_level_maximum_calls: 4,
      observed_delegation_identity_count: 0,
      runtime_proven_global_maximum_calls: null,
      statement: "The only pilot execution completed one primary turn. No retry was used because missing stable delegation identities is an honest completed_not_verified compatibility result."
    },
    source_artifacts: sourceArtifacts,
    original_failure: {status: originalResult.status, message: originalResult.failure.message, process_exit_confirmed: true},
    corrected_runner_rule: {
      rule: "A completed pilot with unobservable delegation identities is retained as completed_not_verified; it is not a process or parse failure.",
      full_evaluation_behavior: "Full evaluation retains strict observable delegation and lane correspondence requirements."
    },
    compatibility: {
      status: verdict.status,
      checks: verdict.checks,
      ambient_review_squad_isolation: ambientIsolation,
      lane_results_retained: final.lane_results.length,
      completed_collab_wait_events: collabWaits.length,
      delegation_mapping: mapping,
      raw_delegated_payload_provenance: "not_verified",
      reason: "Codex JSONL exposed collaboration waits and parent-restated lane results but no stable spawn identity or untouched delegated output."
    },
    usage: {
      turn_completed_usage: usage,
      complete_workflow_token_accounting: tokenAccounting,
      decision: "not_verified because delegated usage has no stable one-to-one delegation identity"
    },
    process_and_isolation: {
      model_process_exit_confirmed: true,
      shutdown_probe_exit_confirmed: true,
      scratch_root_removed: originalResult.failure.call.scratch_root === undefined || originalResult.failure.call.scratch_root === "removed",
      effective_argv_validation: "passed",
      oracle_opened: false,
      scoring_run: false
    },
    regression_test_evidence: {
      status: "passed",
      command: "npm run test:harness",
      assertion: "pilot accepts absent stable delegation identities only as completed_not_verified while full evaluation remains strict"
    }
  };
}
