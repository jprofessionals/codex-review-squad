#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import {PLAYWRIGHT_MCP_ARGS, PLAYWRIGHT_MCP_VERSION, decideMutation, parseResolvedBrowserConfigText, validateRealBrowserIsolation, validateRealBrowserPositiveControl, validateResolvedBrowserConfig} from "./browser-contract.mjs";
import {boundedShutdown, runBoundedProcess, spawnManagedProcess} from "./lib/process-control.mjs";

const usage = "Usage: node verify-real-browser.mjs --plan | --authorized --output <absolute-/tmp/evidence.json>";
const INSTALL_TIMEOUT_MS = 12 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 90 * 1000;
const SHUTDOWN_GRACE_MS = 5 * 1000;
const REQUIRED_CORE_TOOLS = ["browser_close", "browser_evaluate", "browser_navigate"];
const REQUIRED_CONFIG_TOOLS = ["browser_get_config"];
const REQUIRED_STORAGE_TOOLS = ["browser_cookie_list", "browser_localstorage_list", "browser_sessionstorage_list"];

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return {help: true};
  if (argv.length === 1 && argv[0] === "--plan") return {plan: true};
  if (argv.length === 3 && argv[0] === "--authorized" && argv[1] === "--output") {
    const output = path.resolve(argv[2]);
    if (!output.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error("--output must be an absolute path below /tmp");
    return {authorized: true, output};
  }
  throw new Error(usage);
}

function classifyStderr(stderr, exitCode = null) {
  if (exitCode === 0) return stderr.trim() ? "success_with_warning" : "none";
  const text = stderr.toLowerCase();
  if (/eai_again|enotfound|registry|network|fetch failed/.test(text)) return "registry_or_network";
  if (/executable doesn't exist|browser.*not found|install.*browser/.test(text)) return "browser_missing";
  if (/unknown option|invalid.*caps|commandererror/.test(text)) return "released_arguments_rejected";
  if (/npm error|err!/.test(text)) return "npm_error";
  return stderr.trim() ? "unclassified_stderr" : "none";
}

const proposed = {
  command: "node plugins/review-squad/scripts/verify-real-browser.mjs --authorized --output /tmp/review-squad-browser-evidence.json",
  package: `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`,
  install_command: `npx -y @playwright/mcp@${PLAYWRIGHT_MCP_VERSION} install-browser`,
  install_timeout_seconds: INSTALL_TIMEOUT_MS / 1000,
  ordinary_mcp_timeout_seconds: REQUEST_TIMEOUT_MS / 1000,
  released_arguments: PLAYWRIGHT_MCP_ARGS,
  required_tools: [...REQUIRED_CORE_TOOLS, ...REQUIRED_CONFIG_TOOLS, ...REQUIRED_STORAGE_TOOLS],
  assertions: [
    "pinned install-browser CLI succeeds",
    "the exact released arguments initialize",
    "config and storage tools relied on by production guidance are exposed and callable",
    "resolved config is isolated, blocks service workers, and has no persistent profile or storage-state input",
    "a disposable loopback page launches and navigates",
    "cookie/localStorage/sessionStorage state planted in process one is observable through page evaluation and each matching inspection tool",
    "the planted state is absent through page evaluation and every storage inspection tool in process two",
    "both MCP sessions have empty protocol_errors and confirmed process-tree exits",
    "the stop-before-external-write decision leaves the target with zero POST requests"
  ],
  network: ["npm registry for the exact MCP package", "Playwright browser CDN for its matching Chromium binary"],
  writes: ["one unique /tmp root containing explicit XDG/npm caches, browser binaries, TMPDIR, MCP output, and scratch data", "the explicitly requested /tmp evidence JSON"],
  duration: "approximately 3-10 minutes; browser installation is allowed 12 minutes",
  cleanup: "close MCP stdin, wait 5 seconds, then signal the process group with SIGTERM/SIGKILL only if needed; remove the unique root only after confirmed exits; otherwise retain PID/PGID evidence and recovery guidance"
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

async function runCommand(command, commandArgs, options) {
  try {
    const result = await runBoundedProcess(command, commandArgs, {
      ...options,
      shutdown: {gracefulMs: SHUTDOWN_GRACE_MS, termMs: SHUTDOWN_GRACE_MS, killMs: SHUTDOWN_GRACE_MS}
    });
    return {...result, stderr_class: classifyStderr(result.stderr, result.code)};
  } catch (error) {
    if (error.result) error.result.stderr_class = classifyStderr(error.result.stderr ?? "", error.result.code);
    throw error;
  }
}

class McpClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.exit = null;
    this.protocolErrors = [];
    readline.createInterface({input: child.stdout}).on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.protocolErrors.push(`non-JSON stdout: ${line.slice(0, 300)}`);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    child.stderr.on("data", (chunk) => { this.stderr = `${this.stderr}${chunk}`.slice(-24000); });
    child.once("error", (error) => this.rejectAll(new Error(`MCP process error: ${error.message}`)));
    child.once("exit", (code, signal) => {
      this.exit = {code, signal};
      this.rejectAll(new Error(`MCP process exited before completing requests: code=${code} signal=${signal}; stderr=${this.stderr}`));
    });
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request(method, params = {}) {
    if (this.exit) return Promise.reject(new Error(`MCP process already exited: ${JSON.stringify(this.exit)}`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP timeout for ${method}: ${this.stderr}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.child.stdin.write(`${JSON.stringify({jsonrpc: "2.0", id, method, params})}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        this.pending.delete(id);
        pending?.reject(error);
      });
    });
  }

  notify(method, params = {}) {
    if (!this.exit) this.child.stdin.write(`${JSON.stringify({jsonrpc: "2.0", method, params})}\n`);
  }

  call(name, toolArgs = {}) {
    return this.request("tools/call", {name, arguments: toolArgs});
  }
}

function confinedEnvironment(tempRoot) {
  return {
    ...process.env,
    XDG_CACHE_HOME: path.join(tempRoot, "xdg-cache"),
    npm_config_cache: path.join(tempRoot, "npm-cache"),
    PLAYWRIGHT_BROWSERS_PATH: path.join(tempRoot, "browsers"),
    TMPDIR: path.join(tempRoot, "tmp")
  };
}

function startMcp(tempRoot) {
  const testOnlyArgs = ["--headless", "--output-dir", path.join(tempRoot, "mcp-output")];
  const child = spawnManagedProcess("npx", [...PLAYWRIGHT_MCP_ARGS, ...testOnlyArgs], {
    cwd: tempRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: confinedEnvironment(tempRoot)
  });
  return {child, client: new McpClient(child), testOnlyArgs};
}

async function initialize(client) {
  const initialized = await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {name: "review-squad-release-verifier", version: "0.4.0"}
  });
  client.notify("notifications/initialized");
  const listed = await client.request("tools/list");
  const tools = listed.tools.map(({name}) => name).sort();
  for (const required of [...REQUIRED_CORE_TOOLS, ...REQUIRED_CONFIG_TOOLS, ...REQUIRED_STORAGE_TOOLS]) {
    assert(tools.includes(required), `pinned MCP did not expose required tool ${required}`);
  }
  return {initialized, tools};
}

function toolText(result) {
  return (result?.content ?? []).filter(({type}) => type === "text").map(({text}) => text).join("\n");
}

function diagnosticForStage(stage) {
  return stage === "config_validation" ? "resolved_config_invalid" : `${stage}_failed`;
}

async function runSession(tempRoot, url, {plant = false} = {}) {
  const {child, client, testOnlyArgs} = startMcp(tempRoot);
  let outcome;
  let sessionError;
  let shutdown;
  let stage = "initialization";
  const partial = {
    initialized_server_info: null,
    tools: [],
    resolved_config_text: null,
    resolved_config: null,
    config_validation: null,
    navigation_started: false,
    failed_stage: null,
    diagnostic_classification: null,
    protocol_errors: [],
    stderr_class: "none",
    stderr: "",
    shutdown: null
  };
  try {
    const state = await initialize(client);
    partial.initialized_server_info = state.initialized.serverInfo;
    partial.tools = state.tools;
    stage = "config_request";
    const config = await client.call("browser_get_config");
    partial.resolved_config_text = toolText(config);
    stage = "config_parse";
    partial.resolved_config = parseResolvedBrowserConfigText(partial.resolved_config_text);
    stage = "config_validation";
    partial.config_validation = validateResolvedBrowserConfig(partial.resolved_config);
    stage = "navigation";
    partial.navigation_started = true;
    const navigation = await client.call("browser_navigate", {url});
    if (plant) {
      stage = "positive_control_plant";
      await client.call("browser_evaluate", {
        function: "() => { document.cookie='review_squad=planted-secret'; localStorage.setItem('review_squad','planted-secret'); sessionStorage.setItem('review_squad','planted-secret'); return 'planted'; }"
      });
    }
    stage = "storage_inspection";
    const storage = {
      cookies: await client.call("browser_cookie_list"),
      local: await client.call("browser_localstorage_list"),
      session: await client.call("browser_sessionstorage_list")
    };
    stage = "page_evaluation";
    const evaluation = await client.call("browser_evaluate", {
      function: "() => ({cookie: document.cookie, local: localStorage.getItem('review_squad'), session: sessionStorage.getItem('review_squad')})"
    });
    stage = "browser_close";
    await client.call("browser_close");
    outcome = {
      state,
      config_text: partial.resolved_config_text,
      config: partial.resolved_config,
      config_validation: partial.config_validation,
      navigation,
      navigation_started: partial.navigation_started,
      storage,
      evaluation,
      test_only_args: testOnlyArgs,
      stderr: client.stderr,
      stderr_class: classifyStderr(client.stderr),
      protocol_errors: client.protocolErrors
    };
  } catch (error) {
    sessionError = error;
    partial.failed_stage = stage;
    partial.diagnostic_classification = diagnosticForStage(stage);
  } finally {
    shutdown = await boundedShutdown(child, {gracefulMs: SHUTDOWN_GRACE_MS, termMs: SHUTDOWN_GRACE_MS, killMs: SHUTDOWN_GRACE_MS});
    partial.protocol_errors = client.protocolErrors;
    partial.stderr = client.stderr;
    partial.stderr_class = classifyStderr(client.stderr);
    partial.shutdown = shutdown;
  }
  if (!shutdown.exit_confirmed) {
    const leak = new Error(`MCP process tree exit was not confirmed for pid=${shutdown.pid} pgid=${shutdown.pgid}`);
    leak.sessionEvidence = {...partial, failed_stage: "shutdown", diagnostic_classification: "process_exit_unconfirmed"};
    throw leak;
  }
  if (sessionError) {
    sessionError.sessionEvidence = partial;
    throw sessionError;
  }
  return {...outcome, shutdown};
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-browser-"));
for (const directory of ["xdg-cache", "npm-cache", "browsers", "tmp", "mcp-output"]) fs.mkdirSync(path.join(tempRoot, directory), {recursive: true});
let posts = 0;
let serverClosed = false;
let tempRemoved = false;
let installEvidence = null;
let first = null;
let second = null;
const server = http.createServer((request, response) => {
  if (request.method === "POST") posts += 1;
  response.writeHead(200, {"content-type": "text/html"});
  response.end("<!doctype html><html><body><h1>Disposable target</h1><form method='post'><button>Submit external action</button></form></body></html>");
});

const evidence = {
  schema_version: "2.0",
  status: "running",
  generated_at: new Date().toISOString(),
  package: `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`,
  install_cli: ["npx", "-y", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`, "install-browser"],
  released_args: PLAYWRIGHT_MCP_ARGS,
  temp_root: tempRoot,
  checks: {},
  stderr: [],
  cleanup: {server_closed: false, temporary_root_removed: false, commands: [], sessions: []}
};

try {
  installEvidence = await runCommand("npx", ["-y", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`, "install-browser"], {
    cwd: tempRoot,
    env: confinedEnvironment(tempRoot),
    stdio: ["ignore", "pipe", "pipe"],
    timeoutMs: INSTALL_TIMEOUT_MS
  });
  evidence.checks.install_browser_cli = "passed";
  evidence.install = {command: installEvidence.command, code: installEvidence.code, status: installEvidence.stderr_class === "none" ? "success" : "success_with_warning", stderr_class: installEvidence.stderr_class, stderr: installEvidence.stderr};
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  first = await runSession(tempRoot, url, {plant: true});
  const positive = validateRealBrowserPositiveControl(first);
  assert.equal(positive.valid, true, `process-one positive controls failed before process two: ${JSON.stringify(positive)}`);
  second = await runSession(tempRoot, url);
  const isolation = validateRealBrowserIsolation({first, second});
  assert.equal(isolation.valid, true, `browser isolation controls failed: ${JSON.stringify(isolation)}`);
  assert.equal(decideMutation({action: "final_signup_submit", approval: false}).decision, "stop");
  assert.equal(posts, 0, "disposable target received a forbidden submission");
  evidence.status = "passed";
  evidence.checks = {
    ...evidence.checks,
    released_arguments_initialized: "passed",
    required_tools_exposed: "passed",
    config_inspection: "passed",
    storage_inspection: "passed",
    isolation_positive_controls: "passed",
    isolation_negative_controls: "passed",
    navigation: "passed",
    sequential_process_isolation: "passed",
    stop_before_external_write: "passed",
    target_post_count: posts
  };
  evidence.isolation_controls = isolation;
  evidence.sessions = [first, second].map((session) => ({
    server_info: session.state.initialized.serverInfo,
    tools: session.state.tools,
    config_text: session.config_text,
    config: session.config,
    config_validation: session.config_validation,
    navigation_started: session.navigation_started,
    storage: session.storage,
    evaluation: session.evaluation,
    test_only_args: session.test_only_args,
    protocol_errors: session.protocol_errors,
    stderr_class: session.stderr_class,
    stderr: session.stderr
  }));
} catch (error) {
  evidence.status = "failed";
  evidence.failure = {name: error.name, message: error.message, stage: error.sessionEvidence?.failed_stage ?? (error.result ? "install_browser" : "unknown"), diagnostic_classification: error.sessionEvidence?.diagnostic_classification ?? error.result?.diagnostic?.kind ?? "unclassified_failure"};
  if (error.sessionEvidence) evidence.partial_session = error.sessionEvidence;
  if (error.sessionEvidence) evidence.cleanup.sessions.push(error.sessionEvidence.shutdown);
  if (error.result?.shutdown) evidence.cleanup.commands.push(error.result.shutdown);
  const stderr = error.result?.stderr ?? error.sessionEvidence?.stderr ?? installEvidence?.stderr ?? first?.stderr ?? second?.stderr ?? "";
  const classification = error.result?.stderr_class ?? error.sessionEvidence?.stderr_class ?? installEvidence?.stderr_class ?? classifyStderr(stderr);
  evidence.stderr.push({source: error.result ? "install_or_command" : "mcp", classification, text: stderr.slice(-24000)});
  process.exitCode = 1;
} finally {
  evidence.cleanup.sessions.push(...[first, second].filter(Boolean).map((session) => session.shutdown).filter(Boolean));
  if (server.listening) {
    await new Promise((resolve) => server.close(() => { serverClosed = true; resolve(); }));
  } else {
    serverClosed = true;
  }
  evidence.cleanup.server_closed = serverClosed;
  evidence.loopback = {
    navigation_started: [first, second].some((session) => session?.navigation_started === true) || evidence.partial_session?.navigation_started === true,
    target_post_count: posts
  };
  const allExitsConfirmed = [...evidence.cleanup.commands, ...evidence.cleanup.sessions].every(({exit_confirmed}) => exit_confirmed === true);
  if (allExitsConfirmed) {
    try {
      fs.rmSync(tempRoot, {recursive: true, force: true});
      tempRemoved = !fs.existsSync(tempRoot);
    } catch (error) {
      evidence.cleanup.temporary_root_error = error.message;
      process.exitCode = 1;
    }
  } else {
    evidence.cleanup.temporary_root_error = "retained because at least one MCP process exit was not confirmed";
  }
  evidence.cleanup.temporary_root_removed = tempRemoved;
  if (!serverClosed || !tempRemoved) {
    evidence.status = "failed";
    evidence.failure ??= {name: "CleanupError", message: "browser verifier cleanup was incomplete"};
  }
  fs.mkdirSync(path.dirname(parsed.output), {recursive: true});
  fs.writeFileSync(parsed.output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
