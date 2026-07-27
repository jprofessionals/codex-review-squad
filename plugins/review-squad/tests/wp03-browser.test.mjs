import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {
  PLAYWRIGHT_MCP_ARGS,
  BROWSER_ARTIFACT_OUTPUT_TOOLS,
  PLAYWRIGHT_MCP_CONFIG,
  PLAYWRIGHT_MCP_VERSION,
  assessDelegatedBrowserApproval,
  browserToolTimeoutDiagnostic,
  classifyNormiesPanel,
  classifyStorageProbe,
  decideMutation,
  diagnoseBrowserFailure,
  isolationChecks,
  resolveArtifactRoot,
  policyResult,
  policyScenarios,
  parseResolvedBrowserConfigText,
  prepareBrowserArtifactCall,
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

test("MCP is exactly pinned, non-interactive, isolated, and uses external session output", () => {
  const mcp = readJson(path.join(pluginRoot, ".mcp.json"));
  assert.equal(PLAYWRIGHT_MCP_VERSION, "0.0.78");
  assert.deepEqual(mcp.mcpServers.playwright, PLAYWRIGHT_MCP_CONFIG);
  assert.deepEqual(mcp.mcpServers.playwright.env_vars, ["REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT"]);
  assert(PLAYWRIGHT_MCP_ARGS.includes("-y"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("--isolated"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("--block-service-workers"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("stdout"));
  assert(PLAYWRIGHT_MCP_ARGS.includes("storage,config"));
  assert(!PLAYWRIGHT_MCP_ARGS.includes("storage,network,config"));
  assert(!JSON.stringify(mcp).includes("@latest"));
  assert(!PLAYWRIGHT_MCP_ARGS.some((arg) => arg.includes("user-data-dir") || arg.includes("storage-state") || arg.includes("shared-browser-context") || arg.includes("grant-permissions")));
  assert(PLAYWRIGHT_MCP_CONFIG.args.at(-1).includes("--output-dir"));
  assert(PLAYWRIGHT_MCP_CONFIG.args.at(-1).includes("REVIEW_SQUAD_MCP_OUTPUT_ROOT"));
});

test("MCP launcher never lets pinned output fall back to target cwd", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-mcp-launcher-test-"));
  const target = path.join(root, "target");
  const bin = path.join(root, "bin");
  const artifactBase = path.join(root, "artifacts");
  let outputRoot = null;
  try {
    fs.mkdirSync(target);
    fs.mkdirSync(bin);
    fs.mkdirSync(artifactBase);
    const fakeNpx = path.join(bin, "npx");
    fs.writeFileSync(fakeNpx, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const index = args.indexOf("--output-dir");
const output = index >= 0 ? args[index + 1] : path.join(process.cwd(), ".playwright-mcp");
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, "captured.log"), "diagnostic");
process.exit(7);
`);
    fs.chmodSync(fakeNpx, 0o755);
    const result = spawnSync(PLAYWRIGHT_MCP_CONFIG.command, PLAYWRIGHT_MCP_CONFIG.args, {
      cwd: target,
      env: {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT: artifactBase},
      encoding: "utf8",
      timeout: 10_000
    });
    assert.equal(result.status, 7, result.stderr);
    outputRoot = result.stderr.match(/REVIEW_SQUAD_MCP_OUTPUT_ROOT=(.+)/)?.[1]?.trim() ?? null;
    assert(outputRoot, result.stderr);
    assert.equal(path.relative(artifactBase, outputRoot).startsWith(".."), false);
    assert.equal(path.relative(target, outputRoot).startsWith(".."), true);
    assert.equal(fs.readFileSync(path.join(outputRoot, "captured.log"), "utf8"), "diagnostic");
    assert.equal(fs.existsSync(path.join(target, ".playwright-mcp")), false);
    assert.deepEqual(fs.readdirSync(target), []);
  } finally {
    if (outputRoot) fs.rmSync(outputRoot, {recursive: true, force: true});
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test("MCP launcher rejects a configured artifact base inside target cwd before startup", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-mcp-root-rejection-test-"));
  const target = path.join(root, "target");
  try {
    fs.mkdirSync(target);
    const result = spawnSync(PLAYWRIGHT_MCP_CONFIG.command, PLAYWRIGHT_MCP_CONFIG.args, {
      cwd: target,
      env: {...process.env, REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT: path.join(target, "browser-artifacts")},
      encoding: "utf8",
      timeout: 10_000
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /artifact root resolved inside target cwd/);
    assert.deepEqual(fs.readdirSync(target), []);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test("typed browser output paths are absolute, root-confined, and inline-safe", () => {
  const artifactRoot = "/tmp/review-squad-artifacts";
  const mcpOutputRoot = "/tmp/review-squad-mcp";
  for (const [tool, contract] of Object.entries(BROWSER_ARTIFACT_OUTPUT_TOOLS)) {
    assert.throws(
      () => prepareBrowserArtifactCall({tool, args: {filename: "relative.out"}, artifactMode: "written", artifactRoot, mcpOutputRoot}),
      (error) => error.code === "BROWSER_ARTIFACT_PATH_UNSAFE",
      tool
    );
    assert.throws(
      () => prepareBrowserArtifactCall({tool, args: {filename: "/tmp/outside.out"}, artifactMode: "written", artifactRoot, mcpOutputRoot}),
      (error) => error.code === "BROWSER_ARTIFACT_PATH_UNSAFE",
      tool
    );
    const approved = prepareBrowserArtifactCall({tool, args: {filename: `${artifactRoot}/${tool}.out`}, artifactMode: "written", artifactRoot, mcpOutputRoot});
    assert.equal(approved.disposition, "written", tool);
    assert.equal(prepareBrowserArtifactCall({tool, args: {filename: `${mcpOutputRoot}/${tool}.out`}, artifactMode: "written", artifactRoot, mcpOutputRoot}).disposition, "written", tool);
    if (contract.inline_output) {
      const inline = prepareBrowserArtifactCall({tool, args: {filename: "must-not-survive.out", level: "info"}, artifactMode: "inline_only", mcpOutputRoot});
      assert.equal(inline.disposition, "inline", tool);
      assert.equal(Object.hasOwn(inline.args, "filename"), false, tool);
      assert.equal(inline.args.level, "info", tool);
    }
  }
  assert.throws(
    () => prepareBrowserArtifactCall({tool: "browser_take_screenshot", args: {filename: "/tmp/no-approved-root.png"}, artifactMode: "written"}),
    (error) => error.code === "BROWSER_ARTIFACT_PATH_UNSAFE"
  );
  assert.equal(prepareBrowserArtifactCall({tool: "browser_click", args: {ref: "e1"}, artifactMode: "inline_only"}).disposition, "not_an_output_tool");
});

test("browser artifact confinement rejects a symlink escape from an approved root", {skip: process.platform === "win32"}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-browser-symlink-test-"));
  const approved = path.join(root, "approved");
  const outside = path.join(root, "outside");
  try {
    fs.mkdirSync(approved);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(approved, "escape"), "dir");
    assert.throws(
      () => prepareBrowserArtifactCall({
        tool: "browser_take_screenshot",
        args: {filename: path.join(approved, "escape", "leaked.png")},
        artifactMode: "written",
        artifactRoot: approved
      }),
      (error) => error.code === "BROWSER_ARTIFACT_PATH_UNSAFE"
    );
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test("explicit screenshot output leaves a real target cwd byte- and status-unchanged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-browser-artifact-test-"));
  const target = path.join(root, "target");
  const artifactRoot = path.join(root, "artifacts");
  const status = () => spawnSync("git", ["status", "--short"], {cwd: target, encoding: "utf8"});
  const targetManifest = () => {
    const entries = [];
    const walk = (directory, relative = "") => {
      for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!relative && entry.name === ".git") continue;
        const childRelative = path.join(relative, entry.name);
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(child, childRelative);
        else entries.push(`${childRelative}:${crypto.createHash("sha256").update(fs.readFileSync(child)).digest("hex")}`);
      }
    };
    walk(target);
    return entries;
  };
  try {
    fs.mkdirSync(target);
    fs.mkdirSync(artifactRoot);
    fs.writeFileSync(path.join(target, "tracked.txt"), "target bytes\n");
    assert.equal(spawnSync("git", ["init", "--quiet"], {cwd: target}).status, 0);
    assert.equal(spawnSync("git", ["add", "tracked.txt"], {cwd: target}).status, 0);
    const beforeStatus = status();
    assert.equal(beforeStatus.status, 0, beforeStatus.stderr);
    const beforeManifest = targetManifest();
    const screenshotPath = path.join(artifactRoot, "decide-first-load.png");
    const prepared = prepareBrowserArtifactCall({
      tool: "browser_take_screenshot",
      args: {filename: screenshotPath, type: "png"},
      artifactMode: "written",
      artifactRoot
    });
    const writer = spawnSync(process.execPath, ["-e", "require('node:fs').writeFileSync(process.argv[1], Buffer.from('89504e470d0a1a0a','hex'))", prepared.args.filename], {
      cwd: target,
      encoding: "utf8",
      timeout: 10_000
    });
    assert.equal(writer.status, 0, writer.stderr);
    assert.equal(fs.existsSync(screenshotPath), true);
    assert.deepEqual(targetManifest(), beforeManifest);
    const afterStatus = status();
    assert.equal(afterStatus.status, 0, afterStatus.stderr);
    assert.equal(afterStatus.stdout, beforeStatus.stdout);
    assert.equal(fs.existsSync(path.join(target, "decide-first-load.png")), false);
    assert.equal(fs.existsSync(path.join(target, ".playwright-mcp")), false);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test("delegated user-review approval stalls stop before unattended dispatch", () => {
  const stopped = assessDelegatedBrowserApproval({
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    approvalRequiredTools: ["browser_click"]
  });
  assert.equal(stopped.supported_unattended, false);
  assert.equal(stopped.action, "stop_before_persona_dispatch");
  assert.equal(stopped.diagnostic.code, "BROWSER_DELEGATED_APPROVAL_UNATTENDED_UNSUPPORTED");
  assert.deepEqual(stopped.alternatives, ["new_on_request_auto_review_session", "explicit_snapshot_only_fallback"]);
  const supported = assessDelegatedBrowserApproval({
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
    approvalRequiredTools: ["browser_click"]
  });
  assert.equal(supported.supported_unattended, true);
  assert.deepEqual(supported.effective, {approval_policy: "on-request", approvals_reviewer: "auto_review", observed: true});
});

test("browser tool timeout keeps the canonical diagnosis and forbids retry or early close", () => {
  const pending = browserToolTimeoutDiagnostic({
    tool: "browser_click",
    waitedMs: 254_500,
    lastSuccessfulCall: "browser_snapshot",
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    mcpBeginObserved: false,
    callTerminal: false,
    cleanupStatus: "pending_call_cancellation_requested"
  });
  assert.deepEqual(pending, {
    code: "BROWSER_MCP_TOOL_TIMEOUT",
    tool: "browser_click",
    waited_ms: 254_500,
    last_successful_call: "browser_snapshot",
    approval_policy: "on-request",
    approvals_reviewer: "user",
    mcp_begin: "not_observed",
    cleanup_status: "pending_call_cancellation_requested",
    pending_call_terminal: false,
    retry: "forbidden",
    browser_close: "forbidden_until_call_terminal"
  });
  assert.equal(browserToolTimeoutDiagnostic({tool: "browser_click", waitedMs: 1, callTerminal: true}).browser_close, "allowed_after_terminal_confirmation");
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
  assert(!isolationChecks.includes("process_identity_observed"));
  assert(!isolationChecks.includes("cache_fresh_process"));
});

test("origin-less storage SecurityError requests navigation instead of failing isolation", () => {
  assert.deepEqual(classifyStorageProbe({url: "about:blank", errorName: "SecurityError"}), {
    status: "origin_required",
    isolation_failure: false,
    action: "navigate_to_controlled_origin"
  });
  assert.deepEqual(classifyStorageProbe({url: "https://example.test", errorName: null}), {
    status: "verified",
    isolation_failure: false,
    action: "continue"
  });
  assert.equal(classifyStorageProbe({url: "https://example.test", errorName: "SecurityError"}).isolation_failure, true);
});

test("a stopped normies panel preserves completed persona evidence and marks the rest not verified", () => {
  assert.deepEqual(classifyNormiesPanel({planned: ["DECIDE", "VERIFY", "ADOPT"], completed: ["DECIDE"]}), {
    panel_status: "partial",
    not_verified: ["VERIFY", "ADOPT"]
  });
  assert.deepEqual(classifyNormiesPanel({planned: ["DECIDE", "VERIFY", "ADOPT"], completed: []}), {
    panel_status: "not_run",
    not_verified: ["DECIDE", "VERIFY", "ADOPT"]
  });
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
  for (const name of ["normies-not-verified-inline", "normies-partial-panel", "regulars-clean", "well-actually-finding"]) {
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
  assert(preflight.includes("REVIEW_SQUAD_MCP_OUTPUT_ROOT"));
  assert(preflight.includes("REVIEW_SQUAD_BROWSER_ARTIFACT_ROOT"));
  assert(preflight.includes("BROWSER_ARTIFACT_PATH_UNSAFE"));
  assert(preflight.includes("BROWSER_MCP_TOOL_TIMEOUT"));
  assert(preflight.includes("approval_policy=on-request"));
  assert(preflight.includes("approvals_reviewer=auto_review"));
  assert.match(preflight, /Never pass a relative output `filename`/);
  assert.match(preflight, /missing\s+observability, not evidence of a leak/);
  assert(preflight.includes("context-and-storage isolation"));
  assert.match(preflight, /allowed only in RG-06 or an explicitly\s+authorized isolation\/field-test harness/);
  assert.match(preflight, /Ordinary reviews must not create one/);
  assert.match(preflight, /must never be sent to a server/);
  assert.match(preflight, /must\s+disappear with the isolated browser context/);
  assert(readme.includes("`browser_close` tool result"));
  assert(readme.includes("`about:blank` can legitimately"));
  assert(readme.includes("diagnostic observability, not treated as a leak"));
});
