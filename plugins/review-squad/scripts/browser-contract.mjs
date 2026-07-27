import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const PLAYWRIGHT_MCP_VERSION = "0.0.78";

export const PLAYWRIGHT_MCP_ARGS = [
  "-y",
  `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`,
  "--isolated",
  "--block-service-workers",
  "--caps",
  "storage,config",
  "--output-mode",
  "stdout"
];

export const PLAYWRIGHT_MCP_LAUNCHER_SOURCE = "import{mkdirSync,mkdtempSync,readdirSync,rmSync,writeSync}from'node:fs';import{tmpdir}from'node:os';import{isAbsolute,join,relative,resolve,sep}from'node:path';import{spawn}from'node:child_process';const cwd=resolve(process.cwd());const configured=process.env.REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT;if(configured&&!isAbsolute(configured))throw new Error('REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT must be absolute');const base=resolve(configured||tmpdir());const baseRel=relative(cwd,base);if(baseRel===''||(!baseRel.startsWith(`..${sep}`)&&baseRel!=='..'&&!isAbsolute(baseRel)))throw new Error('Playwright MCP artifact root resolved inside target cwd');mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'review-squad-playwright-'));const rel=relative(cwd,root);if(rel===''||(!rel.startsWith(`..${sep}`)&&rel!=='..'&&!isAbsolute(rel))){rmSync(root,{recursive:true,force:true});throw new Error('Playwright MCP output root resolved inside target cwd')}writeSync(2,`REVIEW_SQUAD_MCP_OUTPUT_ROOT=${root}\\n`);const child=spawn('npx',['-y','@playwright/mcp@0.0.78','--isolated','--block-service-workers','--caps','storage,config','--output-mode','stdout','--output-dir',root],{stdio:'inherit'});for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>child.kill(signal));child.once('error',error=>{writeSync(2,`REVIEW_SQUAD_MCP_START_ERROR=${error.message}\\n`);process.exitCode=1});child.once('exit',(code,signal)=>{if(code===0&&readdirSync(root).length===0)rmSync(root,{recursive:true,force:true});process.exitCode=code??(signal?1:0)});";

export const PLAYWRIGHT_MCP_CONFIG = {
  command: "node",
  args: ["--input-type=module", "-e", PLAYWRIGHT_MCP_LAUNCHER_SOURCE],
  env_vars: ["REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT"]
};

export const BROWSER_ARTIFACT_OUTPUT_TOOLS = Object.freeze({
  browser_console_messages: {path_argument: "filename", inline_output: true},
  browser_network_request: {path_argument: "filename", inline_output: true},
  browser_network_requests: {path_argument: "filename", inline_output: true},
  browser_snapshot: {path_argument: "filename", inline_output: true},
  browser_storage_state: {path_argument: "filename", inline_output: false},
  browser_take_screenshot: {path_argument: "filename", inline_output: true}
});

const resolveThroughExistingAncestor = (value) => {
  let existing = path.resolve(value);
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    assert.notEqual(parent, existing, `cannot resolve filesystem ancestor for ${value}`);
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.resolve(fs.realpathSync(existing), ...missing);
};

const pathWithin = (root, candidate) => {
  const relative = path.relative(resolveThroughExistingAncestor(root), resolveThroughExistingAncestor(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

export function prepareBrowserArtifactCall({tool, args = {}, artifactMode, artifactRoot = null, mcpOutputRoot = null}) {
  const contract = BROWSER_ARTIFACT_OUTPUT_TOOLS[tool];
  if (!contract) return {tool, args: {...args}, artifact_path: null, disposition: "not_an_output_tool"};

  const outputArgs = {...args};
  const value = outputArgs[contract.path_argument];
  if (artifactMode === "inline_only" && contract.inline_output) {
    delete outputArgs[contract.path_argument];
    return {tool, args: outputArgs, artifact_path: null, disposition: "inline"};
  }
  if (value === undefined) {
    return {tool, args: outputArgs, artifact_path: null, disposition: "mcp_managed_output"};
  }
  const roots = [artifactRoot, mcpOutputRoot].filter(Boolean);
  if (typeof value !== "string" || !path.isAbsolute(value) || roots.length === 0 || !roots.some((root) => path.isAbsolute(root) && pathWithin(root, value))) {
    const error = new Error("Browser artifact output path must be absolute and inside the approved artifact root or reported MCP output root");
    error.code = "BROWSER_ARTIFACT_PATH_UNSAFE";
    throw error;
  }
  return {tool, args: outputArgs, artifact_path: path.resolve(value), disposition: "written"};
}

export function assessDelegatedBrowserApproval({approvalPolicy = null, approvalsReviewer = null, approvalRequiredTools = []}) {
  const effective = {
    approval_policy: approvalPolicy,
    approvals_reviewer: approvalsReviewer,
    observed: approvalPolicy !== null || approvalsReviewer !== null
  };
  if (approvalRequiredTools.length > 0 && approvalPolicy === "on-request" && approvalsReviewer === "user") {
    return {
      supported_unattended: false,
      action: "stop_before_persona_dispatch",
      diagnostic: {
        code: "BROWSER_DELEGATED_APPROVAL_UNATTENDED_UNSUPPORTED",
        message: "Delegated browser actions cannot wait unattended for a user approval reviewer. Start a new session with approval_policy=on-request and approvals_reviewer=auto_review, or explicitly choose the limited snapshot-only fallback."
      },
      effective,
      approval_required_tools: [...approvalRequiredTools],
      alternatives: ["new_on_request_auto_review_session", "explicit_snapshot_only_fallback"]
    };
  }
  return {
    supported_unattended: true,
    action: "continue_preflight",
    diagnostic: null,
    effective,
    approval_required_tools: [...approvalRequiredTools],
    alternatives: []
  };
}

export function browserToolTimeoutDiagnostic({
  tool,
  waitedMs,
  lastSuccessfulCall = null,
  approvalPolicy = null,
  approvalsReviewer = null,
  mcpBeginObserved = false,
  callTerminal = false,
  cleanupStatus = "not_started"
}) {
  assert.equal(typeof tool, "string", "timed-out browser tool is required");
  assert(Number.isFinite(waitedMs) && waitedMs >= 0, "waitedMs must be a non-negative number");
  return {
    code: "BROWSER_MCP_TOOL_TIMEOUT",
    tool,
    waited_ms: waitedMs,
    last_successful_call: lastSuccessfulCall,
    approval_policy: approvalPolicy,
    approvals_reviewer: approvalsReviewer,
    mcp_begin: mcpBeginObserved ? "observed" : "not_observed",
    cleanup_status: cleanupStatus,
    pending_call_terminal: callTerminal,
    retry: "forbidden",
    browser_close: callTerminal ? "allowed_after_terminal_confirmation" : "forbidden_until_call_terminal"
  };
}

export const isolationChecks = [
  "fresh_reasoning_context",
  "prior_findings_absent",
  "browser_close_succeeded",
  "resolved_config_valid",
  "fresh_browser_session",
  "cookies_absent",
  "local_storage_absent",
  "session_storage_absent",
  "permissions_default",
  "viewport_declared",
  "navigation_start_url_only"
];

export function classifyStorageProbe({url, errorName = null}) {
  const origin = new URL(url).origin;
  if (origin === "null" && errorName === "SecurityError") {
    return {status: "origin_required", isolation_failure: false, action: "navigate_to_controlled_origin"};
  }
  if (errorName) return {status: "failed", isolation_failure: true, action: "stop"};
  return {status: "verified", isolation_failure: false, action: "continue"};
}

export function classifyNormiesPanel({planned, completed}) {
  const plannedSet = new Set(planned);
  const completedSet = new Set(completed);
  if (plannedSet.size !== planned.length || completedSet.size !== completed.length) {
    throw new Error("persona identities must be unique");
  }
  for (const persona of completedSet) {
    if (!plannedSet.has(persona)) throw new Error(`completed persona was not planned: ${persona}`);
  }
  return {
    panel_status: completed.length === planned.length ? "complete" : completed.length === 0 ? "not_run" : "partial",
    not_verified: planned.filter((persona) => !completedSet.has(persona))
  };
}

function valuesForKeys(value, keys, found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key.toLowerCase())) found.push(child);
    valuesForKeys(child, keys, found);
  }
  return found;
}

export function parseResolvedBrowserConfigText(text) {
  assert.equal(typeof text, "string", "browser_get_config returned no text");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  assert(start >= 0 && end >= start, "browser_get_config returned no JSON object");
  const config = JSON.parse(text.slice(start, end + 1));
  assert(config && typeof config === "object" && !Array.isArray(config), "browser_get_config JSON is not an object");
  return config;
}

export function validateResolvedBrowserConfig(config) {
  const isolatedValues = [config?.isolated, config?.browser?.isolated].filter((value) => value !== undefined);
  assert(isolatedValues.length > 0 && isolatedValues.every((value) => value === true), "resolved config is not isolated");

  const legacyValues = [config?.blockServiceWorkers, config?.browser?.blockServiceWorkers].filter((value) => value !== undefined);
  const contextValue = config?.browser?.contextOptions?.serviceWorkers;
  assert(legacyValues.every((value) => value === true), "resolved config has an unsupported blockServiceWorkers value");
  if (contextValue !== undefined) assert.equal(contextValue, "block", "resolved config has an unsupported browser.contextOptions.serviceWorkers value");
  const representation = contextValue === "block" ? "browser.contextOptions.serviceWorkers=block" : legacyValues.includes(true) ? "blockServiceWorkers=true" : null;
  assert(representation, "resolved config does not block service workers");

  const persistentProfiles = valuesForKeys(config, new Set(["userdata", "userdatadir"])).filter((value) => value !== null && value !== undefined && value !== "");
  assert.deepEqual(persistentProfiles, [], "resolved config contains persistent profile input");
  const storageStates = valuesForKeys(config, new Set(["storagestate"])).filter((value) => value !== null && value !== undefined);
  assert.deepEqual(storageStates, [], "resolved config contains storage-state input");
  return {valid: true, service_worker_representation: representation};
}

const diagnostics = {
  package_missing: {
    code: "BROWSER_PACKAGE_UNAVAILABLE",
    message: "Playwright MCP package is unavailable. Check the pinned package name and npm cache."
  },
  registry_blocked: {
    code: "BROWSER_REGISTRY_UNAVAILABLE",
    message: "Registry or network access failed while resolving Playwright MCP. Restore npm registry access or use a verified cached package."
  },
  browser_missing: {
    code: "BROWSER_BINARY_MISSING",
    message: "Browser binary is missing. Install the browser for the pinned Playwright MCP release, then rerun preflight."
  },
  mcp_startup: {
    code: "BROWSER_MCP_STARTUP_FAILED",
    message: "Playwright MCP failed to start. Check Node, the pinned package, browser binary, and MCP stderr."
  },
  target_unreachable: {
    code: "BROWSER_TARGET_UNREACHABLE",
    message: "Target URL is unreachable. Start the target, verify the URL, and rerun preflight."
  },
  isolation_unavailable: {
    code: "BROWSER_ISOLATION_UNVERIFIED",
    message: "Cold-persona isolation could not be verified. Stop, or downgrade the result to a shared-session observation."
  }
};

export function diagnoseBrowserFailure(kind) {
  return diagnostics[kind] ?? {
    code: "BROWSER_PREFLIGHT_UNKNOWN",
    message: "Browser preflight failed for an unclassified reason. Preserve stderr and stop before persona dispatch."
  };
}

export function verifyColdPersona(input) {
  const missing = isolationChecks.filter((check) => input[check] !== true);
  if (missing.length) {
    return {
      independent: false,
      action: "stop_or_downgrade_independence_claim",
      diagnostic: diagnoseBrowserFailure("isolation_unavailable"),
      missing
    };
  }
  return {independent: true, action: "dispatch_cold_persona", missing: []};
}

const finalActions = new Set([
  "final_signup_submit",
  "place_order",
  "send_message",
  "confirm_subscription",
  "upload_file",
  "save_account_change",
  "delete_account"
]);

export function decideMutation({action, approval = false, environment = "unknown"}) {
  if (!finalActions.has(action)) return {decision: "allowed", cleanup_required: false};
  if (!approval) return {decision: "stop", cleanup_required: false};
  if (environment === "sandbox" || environment === "test") {
    return {decision: "allowed_with_cleanup", cleanup_required: true};
  }
  return {decision: "approval_requires_safe_environment", cleanup_required: false};
}

export function resolveArtifactRoot({targetRepository, targetRepositoryWritable = false, approvedOutputDirectory}) {
  if (targetRepository && targetRepositoryWritable) {
    return {
      status: "written",
      root: `${targetRepository}/.review-squad/reports`,
      reason: "writable_target_repository"
    };
  }
  if (approvedOutputDirectory) {
    return {
      status: "written",
      root: `${approvedOutputDirectory}/.review-squad/reports`,
      reason: "explicit_user_approved_output_directory"
    };
  }
  return {status: "inline_only", root: null, reason: "no_approved_writable_artifact_root"};
}

function realBrowserChannels(session) {
  return {
    page_evaluation: session.evaluation,
    cookie_inspection: session.storage?.cookies,
    local_storage_inspection: session.storage?.local,
    session_storage_inspection: session.storage?.session
  };
}

export function validateRealBrowserPositiveControl(first, marker = "planted-secret") {
  const contains = (value) => JSON.stringify(value).includes(marker);
  const missing = Object.entries(realBrowserChannels(first)).filter(([, value]) => !contains(value)).map(([name]) => name);
  return {valid: missing.length === 0, missing_positive_controls: missing};
}

export function validateRealBrowserIsolation({first, second, marker = "planted-secret"}) {
  const contains = (value) => JSON.stringify(value).includes(marker);
  const missingPositiveControls = validateRealBrowserPositiveControl(first, marker).missing_positive_controls;
  const secondChannels = realBrowserChannels(second);
  const leakedNegativeControls = Object.entries(secondChannels).filter(([, value]) => contains(value)).map(([name]) => name);
  const protocolErrors = [...(first.protocol_errors ?? []), ...(second.protocol_errors ?? [])];
  const unconfirmedExits = [first, second].map((session, index) => ({process: index + 1, exit_confirmed: session.shutdown?.exit_confirmed === true})).filter(({exit_confirmed}) => !exit_confirmed).map(({process}) => process);
  return {
    valid: missingPositiveControls.length === 0 && leakedNegativeControls.length === 0 && protocolErrors.length === 0 && unconfirmedExits.length === 0,
    missing_positive_controls: missingPositiveControls,
    leaked_negative_controls: leakedNegativeControls,
    protocol_errors: protocolErrors,
    unconfirmed_processes: unconfirmedExits
  };
}

export const policyScenarios = {
  warm: {deterministic: true, expected: "requires_authorized_execution"},
  cold_first_launch: {deterministic: true, expected: "requires_authorized_execution"},
  cached_offline: {deterministic: true, expected: "deferred_field_test"},
  missing_browser: {deterministic: true, expected: "browser_missing"},
  blocked_registry: {deterministic: true, expected: "registry_blocked"},
  startup_failure: {deterministic: true, expected: "mcp_startup"},
  unreachable_target: {deterministic: true, expected: "target_unreachable"},
  isolation_failure: {deterministic: true, expected: "isolation_unavailable"},
  mutation_boundary: {deterministic: true, expected: "stop"},
  artifact_root: {deterministic: true, expected: "inline_only"},
  schema2_mode_output: {deterministic: true, expected: "valid_schema2_and_rendered_markdown"}
};

export function policyResult(scenario) {
  const definition = policyScenarios[scenario];
  if (!definition) return null;
  const diagnostic = diagnoseBrowserFailure(definition.expected);
  return {
    scenario,
    executed: false,
    deterministic_policy_only: definition.deterministic,
    expected: definition.expected,
    diagnostic: diagnostic.code === "BROWSER_PREFLIGHT_UNKNOWN" ? null : diagnostic
  };
}
