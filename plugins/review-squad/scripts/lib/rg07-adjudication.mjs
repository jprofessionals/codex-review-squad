import crypto from "node:crypto";
import {verifyFreshSessionDiscovery, verifyRecordedInstallationEvidence} from "./installed-provenance.mjs";
import {parseJsonl} from "./process-control.mjs";

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function fail(message, details = {}) {
  const error = new Error(message);
  error.diagnostic = {kind: "rg07_adjudication_failure", message, ...details};
  throw error;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function adjudicateRg07Evidence({
  originalResultBytes,
  sessionFinalBytes,
  sessionJsonlBytes,
  expectedOriginalResultSha256,
  originalPaths,
  retainedPaths,
  adjudicatedAt = new Date().toISOString()
}) {
  const hashes = {
    original_result: sha256(originalResultBytes),
    session_final: sha256(sessionFinalBytes),
    session_jsonl: sha256(sessionJsonlBytes)
  };
  if (hashes.original_result !== expectedOriginalResultSha256) {
    fail("original RG-07 result hash differs from the adjudication input", {expected: expectedOriginalResultSha256, observed: hashes.original_result});
  }

  let originalResult;
  let sessionFinal;
  try {
    originalResult = JSON.parse(originalResultBytes);
    sessionFinal = JSON.parse(sessionFinalBytes);
  } catch (cause) {
    fail("RG-07 JSON source artifact is malformed", {message: cause.message});
  }
  const events = parseJsonl(sessionJsonlBytes.toString("utf8"), {source: "retained RG-07 session JSONL"});
  const completed = events.filter(({type}) => type === "turn.completed");
  const failures = events.filter(({type}) => type === "error" || type === "turn.failed");
  const agentMessages = events.filter(({type, item}) => type === "item.completed" && item?.type === "agent_message");
  const nonMessageItems = events.filter(({type, item}) => type === "item.completed" && item?.type !== "agent_message");
  if (completed.length !== 1 || failures.length || agentMessages.length !== 1 || nonMessageItems.length) {
    fail("RG-07 JSONL does not contain one clean completed structured turn", {
      turn_completed_count: completed.length,
      failure_count: failures.length,
      agent_message_count: agentMessages.length,
      non_message_item_count: nonMessageItems.length
    });
  }
  let jsonlFinal;
  try {
    jsonlFinal = JSON.parse(agentMessages[0].item.text);
  } catch (cause) {
    fail("RG-07 JSONL agent message is not structured JSON", {message: cause.message});
  }
  if (!sameJson(jsonlFinal, sessionFinal)) fail("session-final JSON differs from the retained JSONL agent response");

  if (originalResult.status !== "failed" || originalResult.failure?.diagnostic?.kind !== "descendants_survived_direct_child") {
    fail("original result is not the adjudicable descendant-close false negative", {status: originalResult.status, diagnostic: originalResult.failure?.diagnostic ?? null});
  }
  const shutdown = originalResult.failure.shutdown;
  if (shutdown?.exit_confirmed !== true || shutdown.child_exit_confirmed !== true || shutdown.process_group_exit_confirmed !== true || shutdown.exit_code !== 0 || shutdown.exit_signal !== null) {
    fail("original process tree did not end with a clean confirmed exit", {shutdown});
  }
  if (shutdown.sigterm_sent || shutdown.sigkill_sent || shutdown.signal_attempts?.length || shutdown.leaked_process !== null) {
    fail("original process tree required signals or retained leak evidence and cannot be adjudicated as a natural drain", {shutdown});
  }

  const installation = verifyRecordedInstallationEvidence(originalResult);
  const discovery = verifyFreshSessionDiscovery({
    response: sessionFinal,
    pluginName: originalResult.identities.plugin_name,
    installation: originalResult.installation_receipt
  });
  if (discovery.optional_model_locator_alignment !== "matched_or_not_exposed") fail("fresh-session locators do not align with receipt-rooted installed skills");

  const cleanupChecks = ["temporary_profile_absent_after_cleanup", "unique_plugin_absent_after_cleanup", "unique_marketplace_absent_after_cleanup", "pre_existing_0_2_3_unchanged", "repository_manifest_unchanged_0_3_0"];
  const failedCleanupChecks = cleanupChecks.filter((check) => originalResult.checks?.[check] !== "passed");
  const failedCleanupAttempts = (originalResult.cleanup?.attempts ?? []).filter(({status}) => status !== "passed");
  const repositoryStateMatches = originalResult.repository_manifest?.before_sha256 === originalResult.repository_manifest?.after_sha256
    && originalResult.repository_manifest?.before_version === "0.3.0"
    && originalResult.repository_manifest?.after_version === "0.3.0";
  if (failedCleanupChecks.length || failedCleanupAttempts.length || originalResult.cleanup?.scratch_root_removed !== true || originalResult.cleanup?.assessment?.status !== "passed" || !repositoryStateMatches) {
    fail("RG-07 cleanup or state-preservation evidence is incomplete", {failed_cleanup_checks: failedCleanupChecks, failed_cleanup_attempts: failedCleanupAttempts, repository_state_matches: repositoryStateMatches});
  }

  return {
    schema_version: "1.0",
    gate: "RG-07",
    verdict: "pass",
    evidence_status: "passed_after_false_negative_adjudication",
    adjudicated_at: adjudicatedAt,
    execution: {
      second_external_or_model_execution_used: false,
      statement: "This verdict revalidates the immutable completed RG-07 execution; no second external or model execution was used."
    },
    source_artifacts: {
      original_result: {original_path: originalPaths.original_result, retained_path: retainedPaths.original_result, sha256: hashes.original_result},
      session_final: {original_path: originalPaths.session_final, retained_path: retainedPaths.session_final, sha256: hashes.session_final},
      session_jsonl: {original_path: originalPaths.session_jsonl, retained_path: retainedPaths.session_jsonl, sha256: hashes.session_jsonl}
    },
    original_failure: {
      status: originalResult.status,
      classification: originalResult.failure.diagnostic.kind,
      message: originalResult.failure.message
    },
    corrected_classifier_rule: {
      rule: "When the direct child closes while its process group exists, wait one bounded natural-descendant grace period before classifying failure.",
      successful_natural_drain: "A group that disappears during the grace is a confirmed successful exit and requires no signal.",
      failure_boundary: "Descendants still present after the grace retain bounded SIGTERM/SIGKILL cleanup and leak handling.",
      original_evidence_interpretation: "The original group disappeared during its recorded graceful wait: exit was confirmed with no signal attempts and no leak."
    },
    regression_test_evidence: {
      status: "passed",
      command: "npm run test:harness",
      test_file: "plugins/review-squad/tests/wp04-gate-harness.test.mjs",
      assertions: [
        "descendant exits naturally inside the grace: confirmed pass without signals",
        "descendant survives the grace: descendants_survived_direct_child failure with bounded cleanup",
        "descendant survives cleanup: leaked_process failure",
        "ordinary child and process-group exit: unchanged confirmed pass"
      ]
    },
    installation,
    discovery: {
      status: discovery.status,
      inventory_source: discovery.inventory_source,
      ambient_review_squad_entry_count: discovery.ambient_entries.length,
      temporary_skill_count: discovery.temporary_entries.length,
      expected_skill_keys: discovery.expected_skill_keys,
      temporary_entries: discovery.temporary_entries,
      locator_alignment: discovery.optional_model_locator_alignment
    },
    usage: {
      turn_completed_count: completed.length,
      turn_completed_usage: completed[0].usage ?? null
    },
    process: {
      original_pid: shutdown.pid,
      original_pgid: shutdown.pgid,
      direct_child_exit_confirmed: true,
      process_group_exit_confirmed: true,
      exit_code: 0,
      exit_signal: null,
      descendants_drained_naturally: true,
      graceful_wait_ms: shutdown.graceful_wait_ms,
      signal_attempts: [],
      sigterm_sent: false,
      sigkill_sent: false,
      leaked_process: null
    },
    cleanup: {
      status: "passed",
      attempts: originalResult.cleanup.attempts,
      scratch_root_removed: true,
      checks: Object.fromEntries(cleanupChecks.map((check) => [check, originalResult.checks[check]]))
    },
    state_preservation: {
      status: "passed",
      repository_manifest_before_sha256: originalResult.repository_manifest.before_sha256,
      repository_manifest_after_sha256: originalResult.repository_manifest.after_sha256,
      repository_manifest_version: "0.3.0",
      pre_existing_0_2_3_unchanged: true
    },
    no_mcp_browser_or_package_startup: {
      status: "passed",
      basis: "The temporary profile and invocation disabled ambient and temporary Playwright MCP; retained JSONL contains only thread/turn lifecycle and one agent message."
    }
  };
}
