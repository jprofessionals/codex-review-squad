#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {ambientConfigWarningsFromToml, assessRg07Cleanup, buildFreshDiscoveryPrompt, buildFreshSessionArgs, buildInstalledProvenanceSchema, configuredMcpServerNamesFromToml, ProvenanceError, renderFreshSessionProfile, validateFreshSessionArgs, validateFreshSessionProfile, verifyFreshSessionDiscovery, verifyInstallationReceipt} from "./lib/installed-provenance.mjs";
import {createCodexJsonlFailureMonitor, parseJsonl, runBoundedProcess} from "./lib/process-control.mjs";

const usage = "Usage: node verify-installed-plugin.mjs --plan | --authorized --output <new-absolute-/tmp/directory>";
const COMMAND_TIMEOUT_MS = 2 * 60 * 1000;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return {help: true};
  if (argv.length === 1 && argv[0] === "--plan") return {plan: true};
  if (argv.length === 3 && argv[0] === "--authorized" && argv[1] === "--output") {
    const supplied = argv[2];
    const output = path.resolve(supplied);
    if (!path.isAbsolute(supplied) || !output.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error("--output must be a new absolute directory below /tmp");
    return {authorized: true, output};
  }
  throw new Error(usage);
}

const proposed = {
  command: "node plugins/review-squad/scripts/verify-installed-plugin.mjs --authorized --output /tmp/review-squad-rg07-evidence",
  model_calls: 1,
  requested_model: "gpt-5.6-sol",
  requested_reasoning_effort: "high",
  duration: "approximately 2-5 minutes",
  namespace: "a collision-safe unique marketplace name, plugin name, and 0.4.0+codex.rg07-* cachebuster are generated for every run",
  mutations: ["add one unique local /tmp marketplace", "install one uniquely named cachebuster copy", "run one ephemeral read-only Codex session from an isolated /tmp working directory", "remove that plugin and marketplace in finally"],
  provenance: [
    "codex plugin add --json installedPath is the machine-readable installation receipt and the only filesystem root authority",
    "codex plugin list --json source.path is retained only as marketplace/source evidence",
    "the receipt real path must exist, differ from marketplace source, contain the exact manifest/cachebuster, and match the temporary source for manifest, five skills, bundled runtime, and fixture",
    "the installed runtime validates the installed fixture through absolute receipt-rooted paths before the model call",
    "the fresh session proves behavioral discovery through exact Available Skills keys and descriptions; model locators remain optional non-authoritative diagnostics"
  ],
  fresh_session_isolation: [
    "a unique temporary Codex profile supplies the user-config layer required by the pinned plugin loader while leaving HOME and CODEX_HOME unchanged",
    "the profile is validated as closed-world restricted TOML: every pre-existing plugin is disabled, only the temporary plugin is enabled, and ambient/temporary Playwright MCPs are disabled",
    "every machine-discovered ambient MCP server is replaced in the profile by a disabled inert stdio sentinel, avoiding ambient transport, environment, or credential copying",
    "the ambient global config is not strict-validated; recognized legacy fields are retained as operator warnings and approval_policy=never is forced for the invocation",
    "the profile is retained as redacted evidence, removed in finally after confirmed process exit, and its absence is verified",
    "RG-07 expects no MCP server, npm package, or browser startup; RG-06 verifies Playwright separately"
  ],
  fresh_session_argv_template: ["codex", "exec", "--ephemeral", "--json", "--ignore-rules", "--skip-git-repo-check", "--profile", "<unique-profile>", "-m", "gpt-5.6-sol", "-c", "model_reasoning_effort=\"high\"", "-c", "approval_policy=\"never\"", "-c", "plugins.\"review-squad@codex-review-squad\".enabled=false", "-c", "plugins.\"review-squad@codex-review-squad\".mcp_servers.playwright.enabled=false", "-c", "plugins.\"<unique-plugin>@<unique-marketplace>\".enabled=true", "-c", "plugins.\"<unique-plugin>@<unique-marketplace>\".mcp_servers.playwright.enabled=false", "-s", "read-only", "-C", "<unique-/tmp-session-cwd>", "--output-schema", "<absolute-/tmp-schema>", "-o", "<absolute-/tmp-final>", "<provenance-prompt>"],
  writes: ["one unique scratch root below /tmp", "the explicitly supplied /tmp evidence directory", "Codex plugin/marketplace config and cache during the guarded run", "one unique credential-free $CODEX_HOME/<name>.config.toml profile removed in finally"],
  retained_evidence: ["pre-state.json", "post-state.json", "fresh-session-profile.toml", "session.jsonl", "session.stderr.txt", "session-final.json", "result.json"],
  cleanup: "boundedly stop every subprocess; after confirmed exits attempt plugin and marketplace removal independently, verify exact identities and original state, then remove only the unique scratch root; an unconfirmed exit blocks later mutation and retains recovery evidence"
};

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (parsed.help) {
  console.log(usage);
  process.exit(0);
}
if (parsed.plan) {
  process.stdout.write(`${JSON.stringify(proposed, null, 2)}\n`);
  process.exit(0);
}
if (fs.existsSync(parsed.output)) {
  console.error("--output must not already exist");
  process.exit(2);
}
fs.mkdirSync(parsed.output, {recursive: false});

const abortController = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => abortController.abort(new Error(`interrupted by ${signal}`)));
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function command(executable, args, options = {}) {
  const {cwd = repoRoot, timeoutMs = COMMAND_TIMEOUT_MS, signal = abortController.signal, ...rest} = options;
  return runBoundedProcess(executable, args, {cwd, timeoutMs, signal, ...rest});
}

async function jsonCommand(executable, args, options) {
  const result = await command(executable, args, options);
  try {
    return {result, json: JSON.parse(result.stdout)};
  } catch (cause) {
    const error = new Error(`${executable} did not return valid JSON: ${cause.message}`);
    error.result = {...result, diagnostic: {kind: "invalid_json", stdout_tail: result.stdout.slice(-2_000)}};
    throw error;
  }
}

async function snapshotState(options) {
  const plugins = await jsonCommand("codex", ["plugin", "list", "--json"], options);
  const marketplaces = await jsonCommand("codex", ["plugin", "marketplace", "list", "--json"], options);
  const mcpServers = await jsonCommand("codex", ["mcp", "list", "--json"], options);
  return {plugins: plugins.json, marketplaces: marketplaces.json, mcp_servers: mcpServers.json};
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
const sameJson = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const findOriginal023 = (state) => state.plugins.installed.find((plugin) => plugin.pluginId === "review-squad@codex-review-squad" && plugin.version === "0.2.3");
const writeJson = (name, value) => fs.writeFileSync(path.join(parsed.output, name), `${JSON.stringify(value, null, 2)}\n`);

const nonce = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`;
const marketplaceName = `rs-rg07-${nonce}`;
const pluginName = `review-squad-rg07-${nonce}`;
const cachebuster = `0.4.0+codex.rg07-${nonce}`;
const pluginId = `${pluginName}@${marketplaceName}`;
const profileName = `rg07-${nonce}`;
const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
const profilePath = path.join(codexHome, `${profileName}.config.toml`);
const userConfigPath = path.join(codexHome, "config.toml");
const ambientConfigText = fs.existsSync(userConfigPath) ? fs.readFileSync(userConfigPath, "utf8") : "";
const configuredMcpServerNames = configuredMcpServerNamesFromToml(ambientConfigText);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `review-squad-rg07-${nonce}-`));
const sessionCwd = path.join(tempRoot, "fresh-session");
const marketplaceRoot = path.join(tempRoot, "marketplace");
const marketplaceMetadata = path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
const temporaryPluginRoot = path.join(marketplaceRoot, "plugins", pluginName);
const repoManifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const repoManifestBefore = fs.readFileSync(repoManifestPath);
fs.mkdirSync(sessionCwd, {recursive: true});

const resultEvidence = {
  schema_version: "2.0",
  status: "running",
  generated_at: new Date().toISOString(),
  identities: {marketplace_name: marketplaceName, plugin_name: pluginName, plugin_id: pluginId, cachebuster},
  paths: {scratch_root: tempRoot, isolated_session_cwd: sessionCwd, evidence_root: parsed.output, temporary_profile: profilePath},
  repository_manifest: {before_sha256: sha256(repoManifestBefore), before_version: JSON.parse(repoManifestBefore).version},
  warnings: ambientConfigWarningsFromToml(ambientConfigText),
  checks: {}, commands: [], cleanup: {attempts: [], manual_recovery_commands: []}
};
fs.writeFileSync(path.join(parsed.output, "repository-manifest-before.json"), repoManifestBefore);
let preState;
let postState;
let primaryFailure = null;
let exitUnconfirmed = false;

async function recordJsonCommand(label, executable, args, options) {
  try {
    const outcome = await jsonCommand(executable, args, options);
    resultEvidence.commands.push({label, command: outcome.result.command, code: outcome.result.code, stderr: outcome.result.stderr, json: outcome.json});
    return outcome.json;
  } catch (error) {
    resultEvidence.commands.push({label, ...(error.result ?? {command: [executable, ...args], stderr: error.message})});
    throw error;
  }
}

async function cleanupCommand(label, executable, args) {
  try {
    const outcome = await jsonCommand(executable, args, {signal: null});
    resultEvidence.cleanup.attempts.push({label, status: "passed", command: outcome.result.command, json: outcome.json, stderr: outcome.result.stderr});
  } catch (error) {
    resultEvidence.cleanup.attempts.push({label, status: "failed", ...(error.result ?? {command: [executable, ...args], stderr: error.message})});
    if (error.result?.shutdown?.exit_confirmed === false) exitUnconfirmed = true;
  }
}

try {
  assert.equal(JSON.parse(repoManifestBefore).version, "0.4.0", "repository manifest is not exactly 0.4.0");
  preState = await snapshotState();
  writeJson("pre-state.json", preState);
  assert(findOriginal023(preState), "pre-existing review-squad@codex-review-squad 0.2.3 installation is absent");
  assert(!fs.existsSync(profilePath), "unique temporary profile path already exists");

  fs.mkdirSync(path.dirname(marketplaceMetadata), {recursive: true});
  fs.mkdirSync(path.dirname(temporaryPluginRoot), {recursive: true});
  fs.cpSync(pluginRoot, temporaryPluginRoot, {recursive: true});
  const temporaryManifestPath = path.join(temporaryPluginRoot, ".codex-plugin", "plugin.json");
  const temporaryManifest = JSON.parse(fs.readFileSync(temporaryManifestPath, "utf8"));
  temporaryManifest.name = pluginName;
  temporaryManifest.version = cachebuster;
  fs.writeFileSync(temporaryManifestPath, `${JSON.stringify(temporaryManifest, null, 2)}\n`);
  const sourceMarketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), "utf8"));
  sourceMarketplace.name = marketplaceName;
  sourceMarketplace.interface = {...sourceMarketplace.interface, displayName: `Review Squad RG-07 ${nonce}`};
  sourceMarketplace.plugins = [{...sourceMarketplace.plugins[0], name: pluginName, source: {source: "local", path: `./plugins/${pluginName}`}, policy: {installation: "AVAILABLE", authentication: "ON_INSTALL"}}];
  fs.writeFileSync(marketplaceMetadata, `${JSON.stringify(sourceMarketplace, null, 2)}\n`);
  resultEvidence.checks.temporary_copy_only_mutated = "passed";

  await recordJsonCommand("marketplace_add", "codex", ["plugin", "marketplace", "add", marketplaceRoot, "--json"]);
  const pluginAddReceipt = await recordJsonCommand("plugin_add", "codex", ["plugin", "add", pluginId, "--json"]);
  const temporaryList = await recordJsonCommand("plugin_list_temporary", "codex", ["plugin", "list", "--marketplace", marketplaceName, "--json"]);
  const installed = temporaryList.installed.find((plugin) => plugin.pluginId === pluginId);
  if (!installed) throw new ProvenanceError("installation_receipt_failure", "temporary plugin is absent from machine-readable plugin list", {plugin_id: pluginId});
  if (installed.version !== cachebuster) throw new ProvenanceError("installation_receipt_failure", "machine-readable plugin list returned the wrong cachebuster", {expected: cachebuster, observed: installed.version ?? null});
  resultEvidence.marketplace_source_evidence = {source_path: installed.source?.path ?? null, note: "marketplace/source evidence only; never treated as the installed cache root"};

  const installation = verifyInstallationReceipt({
    receipt: pluginAddReceipt,
    marketplaceSourcePath: installed.source?.path,
    temporarySourceRoot: temporaryPluginRoot,
    expectedName: pluginName,
    expectedVersion: cachebuster
  });
  resultEvidence.installation_receipt = installation;
  resultEvidence.paths.installed_cache_root = installation.installed_real_path;
  resultEvidence.paths.installed_runtime = installation.runtime_path;
  resultEvidence.paths.installed_fixture = installation.fixture_path;
  Object.assign(resultEvidence.checks, {
    installation_receipt: "passed",
    installed_path_differs_from_marketplace_source: "passed",
    installed_manifest_identity: "passed",
    installed_cache_content: "passed"
  });
  let runtimeValidation;
  try {
    runtimeValidation = await command(process.execPath, [installation.runtime_path, "validate", installation.fixture_path], {cwd: sessionCwd});
  } catch (error) {
    const failure = new ProvenanceError("runtime_validation_failure", "installed bundled runtime did not validate the installed regulars fixture", {runtime_path: installation.runtime_path, fixture_path: installation.fixture_path, underlying: error.message});
    failure.result = error.result;
    throw failure;
  }
  resultEvidence.commands.push({label: "installed_runtime_validate", ...runtimeValidation});
  resultEvidence.checks.installed_runtime_validation = "passed";

  const profileText = renderFreshSessionProfile({
    pluginName,
    marketplaceName,
    marketplaceRoot,
    preExistingPluginIds: preState.plugins.installed.map(({pluginId: id}) => id),
    mcpServerNames: configuredMcpServerNames
  });
  const profileValidation = validateFreshSessionProfile({
    text: profileText,
    pluginName,
    marketplaceName,
    marketplaceRoot,
    preExistingPluginIds: preState.plugins.installed.map(({pluginId: id}) => id),
    mcpServerNames: configuredMcpServerNames
  });
  fs.writeFileSync(profilePath, profileText, {flag: "wx", mode: 0o600});
  fs.writeFileSync(path.join(parsed.output, "fresh-session-profile.toml"), profileText);
  resultEvidence.temporary_profile = {
    name: profileName,
    path: profilePath,
    sha256: sha256(profileText),
    disabled_plugin_ids: preState.plugins.installed.map(({pluginId: id}) => id).sort(),
    disabled_mcp_servers: configuredMcpServerNames,
    pre_state_resolved_mcp_servers: preState.mcp_servers.map(({name}) => name).sort(),
    enabled_plugin_id: pluginId,
    validation: profileValidation
  };
  resultEvidence.checks.temporary_isolation_profile_validated = "passed";

  const responseSchemaPath = path.join(parsed.output, "session-output.schema.json");
  const sessionJsonlPath = path.join(parsed.output, "session.jsonl");
  const sessionStderrPath = path.join(parsed.output, "session.stderr.txt");
  const sessionFinalPath = path.join(parsed.output, "session-final.json");
  const responseSchema = buildInstalledProvenanceSchema(pluginName);
  fs.writeFileSync(responseSchemaPath, `${JSON.stringify(responseSchema, null, 2)}\n`);
  const prompt = buildFreshDiscoveryPrompt(pluginName);
  let session;
  try {
    const sessionArgs = buildFreshSessionArgs({pluginName, marketplaceName, profileName, mcpServerNames: configuredMcpServerNames, sessionCwd, responseSchemaPath, sessionFinalPath, prompt});
    resultEvidence.fresh_session_invocation_validation = validateFreshSessionArgs({args: sessionArgs, pluginName, marketplaceName, mcpServerNames: configuredMcpServerNames});
    resultEvidence.checks.fresh_session_invocation_validated = "passed";
    resultEvidence.fresh_session_argv = ["codex", ...sessionArgs];
    session = await command("codex", sessionArgs, {
      cwd: sessionCwd,
      timeoutMs: SESSION_TIMEOUT_MS,
      stdin: "",
      onStdout: createCodexJsonlFailureMonitor({source: "RG-07 fresh-session JSONL"})
    });
  } catch (error) {
    fs.writeFileSync(sessionJsonlPath, error.result?.stdout ?? "");
    fs.writeFileSync(sessionStderrPath, error.result?.stderr ?? error.message);
    throw error;
  }
  fs.writeFileSync(sessionJsonlPath, session.stdout);
  fs.writeFileSync(sessionStderrPath, session.stderr);
  let events;
  try {
    events = parseJsonl(session.stdout, {source: "RG-07 fresh-session JSONL"});
  } catch (error) {
    error.result = {...session, diagnostic: error.diagnostic, shutdown: {exit_confirmed: true, exit_code: session.code, exit_signal: session.signal, reason: "parser ran after confirmed process exit"}};
    throw error;
  }
  let sessionFinal;
  try {
    sessionFinal = JSON.parse(fs.readFileSync(sessionFinalPath, "utf8"));
  } catch (cause) {
    const error = new Error(`RG-07 final response is missing or malformed: ${cause.message}`);
    error.result = {...session, diagnostic: {kind: "invalid_final_response", path: sessionFinalPath}, shutdown: {exit_confirmed: true, exit_code: session.code, exit_signal: session.signal, reason: "parser ran after confirmed process exit"}};
    throw error;
  }
  const discovery = verifyFreshSessionDiscovery({response: sessionFinal, pluginName, installation});
  resultEvidence.fresh_session = {
    requested_model: "gpt-5.6-sol", requested_reasoning_effort: "high",
    turn_completed_usage: events.filter(({type}) => type === "turn.completed").at(-1)?.usage ?? null,
    discovery,
    final_response: sessionFinalPath, raw_jsonl: sessionJsonlPath
  };
  Object.assign(resultEvidence.checks, {
    ambient_review_squad_skills_absent: "passed",
    ambient_review_squad_mcp_disabled_by_argv: "passed",
    fresh_session_discovery: "passed",
    optional_model_locator_alignment: discovery.optional_model_locator_alignment
  });
} catch (error) {
  primaryFailure = error;
  if (error.result?.shutdown?.exit_confirmed === false || error.sessionEvidence?.shutdown?.exit_confirmed === false) exitUnconfirmed = true;
  resultEvidence.status = "failed";
  resultEvidence.failure = {name: error.name, message: error.message, diagnostic: error.diagnostic ?? error.result?.diagnostic ?? null, command: error.result?.command, stderr: error.result?.stderr, shutdown: error.result?.shutdown};
  process.exitCode = 1;
} finally {
  if (!exitUnconfirmed) {
    try {
      fs.rmSync(profilePath);
      resultEvidence.cleanup.attempts.push({label: "temporary_profile_remove", status: "passed", path: profilePath});
    } catch (error) {
      resultEvidence.cleanup.attempts.push({label: "temporary_profile_remove", status: error.code === "ENOENT" && !resultEvidence.temporary_profile ? "passed" : "failed", path: profilePath, message: error.message});
    }
  } else resultEvidence.cleanup.attempts.push({label: "temporary_profile_remove", status: "skipped_unconfirmed_process_exit", path: profilePath});
  if (!exitUnconfirmed) await cleanupCommand("plugin_remove", "codex", ["plugin", "remove", pluginId, "--json"]);
  else resultEvidence.cleanup.attempts.push({label: "plugin_remove", status: "skipped_unconfirmed_process_exit"});
  if (!exitUnconfirmed) await cleanupCommand("marketplace_remove", "codex", ["plugin", "marketplace", "remove", marketplaceName, "--json"]);
  else resultEvidence.cleanup.attempts.push({label: "marketplace_remove", status: "skipped_unconfirmed_process_exit"});
  try {
    if (exitUnconfirmed) throw new Error("post-state verification is unsafe while a process tree exit is unconfirmed");
    postState = await snapshotState({signal: null});
    writeJson("post-state.json", postState);
    const uniquePluginAbsent = !postState.plugins.installed.some((plugin) => plugin.pluginId === pluginId);
    const uniqueMarketplaceAbsent = !postState.marketplaces.marketplaces.some((marketplace) => marketplace.name === marketplaceName);
    const originalUnchanged = sameJson(findOriginal023(preState), findOriginal023(postState));
    const repoManifestAfter = fs.readFileSync(repoManifestPath);
    fs.writeFileSync(path.join(parsed.output, "repository-manifest-after.json"), repoManifestAfter);
    const repositoryUnchanged = repoManifestAfter.equals(repoManifestBefore) && JSON.parse(repoManifestAfter).version === "0.4.0";
    const profileAbsent = !fs.existsSync(profilePath);
    Object.assign(resultEvidence.checks, {temporary_profile_absent_after_cleanup: profileAbsent ? "passed" : "failed", unique_plugin_absent_after_cleanup: uniquePluginAbsent ? "passed" : "failed", unique_marketplace_absent_after_cleanup: uniqueMarketplaceAbsent ? "passed" : "failed", pre_existing_0_2_3_unchanged: originalUnchanged ? "passed" : "failed", repository_manifest_unchanged_0_3_1: repositoryUnchanged ? "passed" : "failed"});
    resultEvidence.repository_manifest.after_sha256 = sha256(repoManifestAfter);
    resultEvidence.repository_manifest.after_version = JSON.parse(repoManifestAfter).version;
    if (!profileAbsent || !uniquePluginAbsent || !uniqueMarketplaceAbsent || !originalUnchanged || !repositoryUnchanged) throw new Error("post-cleanup state did not match the pre-run contract");
  } catch (error) {
    resultEvidence.status = "failed";
    resultEvidence.cleanup.post_state_diagnostic = {kind: "cleanup_failure", message: `post-cleanup verification failed: ${error.message}`};
    resultEvidence.failure ??= {name: error.name, message: `post-cleanup verification failed: ${error.message}`, diagnostic: resultEvidence.cleanup.post_state_diagnostic};
    process.exitCode = 1;
  }
  resultEvidence.cleanup.manual_recovery_commands = [`rm -- ${profilePath}`, `codex plugin remove ${pluginId} --json`, `codex plugin marketplace remove ${marketplaceName} --json`, `kill -KILL -- -<recorded-pgid>`, `rm -rf -- ${tempRoot}`];
  if (!exitUnconfirmed) {
    try {
      fs.rmSync(tempRoot, {recursive: true, force: true});
      resultEvidence.cleanup.scratch_root_removed = !fs.existsSync(tempRoot);
    } catch (error) {
      resultEvidence.cleanup.scratch_root_removed = false;
      resultEvidence.cleanup.scratch_error = error.message;
    }
  } else {
    resultEvidence.cleanup.scratch_root_removed = false;
    resultEvidence.cleanup.scratch_error = "retained because process-tree exit was not confirmed";
  }
  const cleanupChecks = Object.fromEntries(["temporary_profile_absent_after_cleanup", "unique_plugin_absent_after_cleanup", "unique_marketplace_absent_after_cleanup", "pre_existing_0_2_3_unchanged", "repository_manifest_unchanged_0_3_0"].map((key) => [key, resultEvidence.checks[key] ?? "failed"]));
  resultEvidence.cleanup.assessment = assessRg07Cleanup({attempts: resultEvidence.cleanup.attempts, scratchRootRemoved: resultEvidence.cleanup.scratch_root_removed, checks: cleanupChecks});
  if (resultEvidence.cleanup.assessment.status !== "passed") {
    resultEvidence.status = "failed";
    resultEvidence.failure ??= {name: "PartialCleanupError", message: "cleanup was incomplete; use the recorded recovery commands after checking machine-readable state", diagnostic: resultEvidence.cleanup.assessment.diagnostic};
    process.exitCode = 1;
  }
  if (!primaryFailure && resultEvidence.status !== "failed") resultEvidence.status = "passed";
  writeJson("result.json", resultEvidence);
  process.stdout.write(`${JSON.stringify(resultEvidence, null, 2)}\n`);
}
