import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {
  PLAYWRIGHT_MCP_ARGS,
  PLAYWRIGHT_MCP_VERSION,
  decideMutation,
  diagnoseBrowserFailure,
  isolationChecks,
  resolveArtifactRoot,
  policyResult,
  policyScenarios,
  parseResolvedBrowserConfigText,
  validateRealBrowserIsolation,
  validateRealBrowserPositiveControl,
  validateResolvedBrowserConfig,
  verifyColdPersona
} from "../scripts/browser-contract.mjs";
import {renderReport} from "../scripts/render-report.mjs";
import {validateReport} from "../scripts/lib/report-validation.mjs";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(testsRoot, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("MCP is exactly pinned, non-interactive, isolated, and does not emit files", () => {
  const mcp = readJson(path.join(pluginRoot, ".mcp.json"));
  assert.equal(PLAYWRIGHT_MCP_VERSION, "0.0.78");
  assert.deepEqual(mcp.mcpServers.playwright, {command: "npx", args: PLAYWRIGHT_MCP_ARGS});
  assert(PLAYWRIGHT_MCP_ARGS.includes("-y"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("--isolated"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("--block-service-workers"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("stdout"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("storage,config"));
  assert(!PLAYWRIGHT_MCP_ARGS.includes("storage,network,config"));
  assert(!JSON.stringify(mcp).includes("@latest"));
  assert(!PLAYWRIGHT_MCP_ARGS.some((arg) => arg.includes("user-data-dir") || arg.includes("storage-state") || arg.includes("shared-browser-context") || arg.includes("grant-permissions")));
});

test("guarded browser verifier uses the pin's install CLI and hardens process lifecycle", () => {
  const source = fs.readFileSync(path.join(pluginRoot, "scripts", "verify-real-browser.mjs"), "utf8");
  for (const expected of [
    "install-browser",
    "INSTALL_TIMEOUT_MS = 12 * 60 * 1000",
    "browser_get_config",
    "browser_cookie_list",
    "browser_localstorage_list",
    "browser_sessionstorage_list",
    "validateResolvedBrowserConfig",
    "rejectAll",
    "boundedShutdown",
    "exit_confirmed",
    "temporary_root_removed",
    "stderr_class"
  ]) assert(source.includes(expected), `browser verifier missing ${expected}`);
  for (const expected of ["success_with_warning", "partial_session", "navigation_started", "target_post_count", "initialized_server_info", "diagnostic_classification"]) {
    assert(source.includes(expected), `browser verifier missing failure evidence ${expected}`);
  }
  assert.match(source, /exitCode === 0.*success_with_warning/, "successful installer stderr must be a warning, not browser_missing");
  assert(!source.includes('client.call("browser_install")'));
  assert(!/^\s*HOME\s*:/m.test(source));
  assert(source.includes("explicit XDG/npm caches"));
  assert(source.includes("TMPDIR"));
});

test("resolved browser config accepts only the two supported service-worker block shapes", () => {
  const captured = readJson(path.join(testsRoot, "fixtures", "browser", "pinned-0.0.78-config.json"));
  assert.deepEqual(validateResolvedBrowserConfig(captured), {valid: true, service_worker_representation: "browser.contextOptions.serviceWorkers=block"});
  const parsed = parseResolvedBrowserConfigText(`### Result\n${JSON.stringify(captured, null, 2)}`);
  assert.deepEqual(parsed, captured);
  assert.deepEqual(validateResolvedBrowserConfig({isolated: true, blockServiceWorkers: true}), {valid: true, service_worker_representation: "blockServiceWorkers=true"});

  for (const invalid of [
    {isolated: true},
    {isolated: true, blockServiceWorkers: false},
    {isolated: true, blockServiceWorkers: "true"},
    {browser: {isolated: true, contextOptions: {serviceWorkers: "allow"}}},
    {browser: {isolated: true, contextOptions: {serviceWorkers: false}}},
    {browser: {isolated: true, contextOptions: {serviceWorkers: "unknown"}}}
  ]) assert.throws(() => validateResolvedBrowserConfig(invalid), /service worker|serviceWorkers/i);

  assert.throws(() => validateResolvedBrowserConfig({isolated: false, blockServiceWorkers: true}), /not isolated/);
  assert.throws(() => validateResolvedBrowserConfig({isolated: true, blockServiceWorkers: true, userDataDir: "/tmp/profile"}), /persistent profile/);
  assert.throws(() => validateResolvedBrowserConfig({isolated: true, blockServiceWorkers: true, storageState: {cookies: []}}), /storage-state/);
});

test("real-browser isolation controls require positive observation before negative isolation", () => {
  const planted = {evaluation: {value: "planted-secret"}, storage: {cookies: "planted-secret", local: "planted-secret", session: "planted-secret"}, protocol_errors: [], shutdown: {exit_confirmed: true}};
  const clean = {evaluation: {value: null}, storage: {cookies: [], local: [], session: []}, protocol_errors: [], shutdown: {exit_confirmed: true}};
  assert.equal(validateRealBrowserIsolation({first: planted, second: clean}).valid, true);
  assert.equal(validateRealBrowserPositiveControl(planted).valid, true);
  assert.deepEqual(validateRealBrowserIsolation({first: {...planted, storage: {...planted.storage, local: []}}, second: clean}).missing_positive_controls, ["local_storage_inspection"]);
  assert.deepEqual(validateRealBrowserIsolation({first: planted, second: {...clean, storage: {...clean.storage, session: "planted-secret"}}}).leaked_negative_controls, ["session_storage_inspection"]);
  assert.equal(validateRealBrowserIsolation({first: planted, second: {...clean, protocol_errors: ["bad"]}}).valid, false);
  assert.deepEqual(validateRealBrowserIsolation({first: planted, second: {...clean, shutdown: {exit_confirmed: false}}}).unconfirmed_processes, [2]);
});

test("cold persona verification rejects every inherited-state dimension", () => {
  const clean = Object.fromEntries(isolationChecks.map((check) => [check, true]));
  assert.deepEqual(verifyColdPersona(clean), {independent: true, action: "dispatch_cold_persona", missing: []});

  for (const check of isolationChecks) {
    const state = {...clean, [check]: false};
    const result = verifyColdPersona(state);
    assert.equal(result.independent, false, check);
    assert.equal(result.action, "stop_or_downgrade_independence_claim", check);
    assert.equal(result.diagnostic.code, "BROWSER_ISOLATION_UNVERIFIED", check);
    assert(result.missing.includes(check), check);
  }
});

test("preflight diagnostics distinguish package, registry, browser, MCP, target, and isolation failures", () => {
  const expected = {
    package_missing: "Playwright MCP package is unavailable",
    registry_blocked: "Registry or network access failed",
    browser_missing: "Browser binary is missing",
    mcp_startup: "Playwright MCP failed to start",
    target_unreachable: "Target URL is unreachable",
    isolation_unavailable: "Cold-persona isolation could not be verified"
  };
  for (const [kind, message] of Object.entries(expected)) {
    const diagnostic = diagnoseBrowserFailure(kind);
    assert.match(diagnostic.message, new RegExp(message));
    assert.notEqual(diagnostic.code, "BROWSER_PREFLIGHT_UNKNOWN");
  }
});

test("mutation boundaries stop all externally visible actions without approval", () => {
  const contract = readJson(path.join(testsRoot, "fixtures", "baseline-contract.json"));
  for (const item of contract.mutation_boundary_cases) {
    const result = decideMutation(item);
    assert.equal(result.decision, item.expected, item.id);
  }
  assert.equal(decideMutation({action: "final_signup_submit", approval: true, environment: "production"}).decision, "approval_requires_safe_environment");
});

test("artifact root resolution only writes to a target repository or explicit approved directory", () => {
  const targetRepository = "/workspace/target";
  assert.deepEqual(resolveArtifactRoot({targetRepository, targetRepositoryWritable: true}), {
    status: "written",
    root: "/workspace/target/.review-squad/reports",
    reason: "writable_target_repository"
  });
  assert.deepEqual(resolveArtifactRoot({approvedOutputDirectory: "/tmp/review-output"}), {
    status: "written",
    root: "/tmp/review-output/.review-squad/reports",
    reason: "explicit_user_approved_output_directory"
  });
  assert.deepEqual(resolveArtifactRoot({targetRepositoryWritable: false}), {
    status: "inline_only",
    root: null,
    reason: "no_approved_writable_artifact_root"
  });
});

test("policy matrix covers expected decisions without claiming browser execution", () => {
  for (const [scenario, expected] of Object.entries(policyScenarios)) {
    const result = policyResult(scenario);
    assert.equal(result.deterministic_policy_only, true, scenario);
    assert.equal(result.executed, false, scenario);
    assert.equal(result.expected, expected.expected, scenario);
  }
  assert.equal(policyScenarios.cached_offline.expected, "deferred_field_test");
});

test("browser-mode report fixtures validate schema 2.0 and render Markdown", () => {
  for (const name of ["normies-not-verified-inline", "regulars-clean", "well-actually-finding"]) {
    const report = readJson(path.join(testsRoot, "fixtures", "reports", "v2", `${name}.json`));
    const validation = validateReport(report);
    assert.equal(validation.valid, true, `${name}: ${JSON.stringify(validation.diagnostics)}`);
    assert.match(renderReport(report), /^# Review Squad:/, name);
  }
});

test("browser documentation carries the same pin, state contract, and regulars safety panel", () => {
  const preflight = fs.readFileSync(path.join(pluginRoot, "references", "browser-preflight.md"), "utf8");
  const regulars = fs.readFileSync(path.join(pluginRoot, "skills", "regulars", "SKILL.md"), "utf8");
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  for (const text of [preflight, readme]) assert(text.includes(`@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`));
  for (const check of ["cookies", "local storage", "session storage", "cache", "permissions", "viewport", "navigation", "prior findings"]) {
    assert(preflight.toLowerCase().includes(check), `preflight missing ${check}`);
  }
  for (const field of ["Environment", "Credential policy", "Allowed mutations", "Forbidden actions", "Exact stop boundary"]) {
    assert(regulars.includes(field), `regulars missing ${field}`);
  }
  assert(!preflight.includes("browser session is shared"));
  assert(!regulars.includes("browser session is shared"));
  assert(preflight.includes("browser_run_code_unsafe"));
  assert(preflight.includes("BROWSER_UNSAFE_TOOL_FORBIDDEN"));
});
