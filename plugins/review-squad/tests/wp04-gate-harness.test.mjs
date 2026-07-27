import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {EventEmitter} from "node:events";
import {controlledSchema, productionSchema, scorerSchema, verifyEvaluationSchemas} from "../scripts/lib/evaluation-schemas.mjs";
import {ambientConfigWarningsFromToml, assessRg07Cleanup, buildFreshDiscoveryPrompt, buildFreshSessionArgs, buildInstalledProvenanceSchema, configuredMcpServerNamesFromToml, INSTALLED_SKILLS, renderFreshSessionProfile, validateFreshSessionArgs, validateFreshSessionProfile, verifyFreshSessionDiscovery, verifyInstallationReceipt} from "../scripts/lib/installed-provenance.mjs";
import {boundedShutdown, classifyDirectChildClose, createCodexJsonlFailureMonitor, parseJsonl, runBoundedProcess} from "../scripts/lib/process-control.mjs";
import {adjudicateRg07Evidence} from "../scripts/lib/rg07-adjudication.mjs";
import {adjudicatePilotEvidence} from "../scripts/lib/pilot-adjudication.mjs";
import {assertStrictOutputSchema} from "../scripts/lib/strict-output-schema.mjs";
import {
  assessAmbientReviewSquadIsolation,
  assessDelegationObservation,
  compareScoringLedgers,
  classifyTokenAccounting,
  computeDeterministicMetrics,
  delegationEvents,
  flattenReviewFindings,
  findingIdentity,
  linkDelegationResults,
  pilotCompatibilityVerdict,
  PRODUCTION_CONTRACTS,
  usageFields,
  validateControlledCaseCoverage,
  validatePilotPrerequisiteRecord,
  validateScoringLedger
} from "../scripts/lib/evaluation-protocol.mjs";

function installationFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-provenance-"));
  const source = path.join(root, "marketplace-source");
  const installed = path.join(root, "installed-cache");
  const name = "review-squad-rg07-fixture";
  const version = "0.3.2+codex.rg07-fixture";
  const write = (base, relative, content) => {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  };
  for (const base of [source, installed]) {
    write(base, ".codex-plugin/plugin.json", `${JSON.stringify({name, version})}\n`);
    for (const skill of INSTALLED_SKILLS) write(base, `skills/${skill}/SKILL.md`, `---\nname: ${skill}\ndescription: Description for ${skill}\n---\n`);
    write(base, "scripts/runtime/review-runtime.mjs", "export const fixture = true;\n");
    write(base, "tests/fixtures/reports/v2/regulars-clean.json", "{}\n");
  }
  const verify = (overrides = {}) => verifyInstallationReceipt({receipt: {installedPath: installed}, marketplaceSourcePath: source, temporarySourceRoot: source, expectedName: name, expectedVersion: version, ...overrides});
  return {root, source, installed, name, version, write, verify};
}

function diagnosticKind(kind) {
  return (error) => {
    assert.equal(error.diagnostic?.kind, kind);
    return true;
  };
}

test("plugin-add installedPath is the filesystem authority and is content-cross-checked", () => {
  const fixture = installationFixture();
  try {
    const verified = fixture.verify();
    assert.equal(verified.status, "verified");
    assert.equal(verified.receipt_installed_path, fixture.installed);
    assert.equal(verified.installed_real_path, fs.realpathSync(fixture.installed));
    assert.notEqual(verified.installed_real_path, verified.marketplace_source_real_path);
    assert.equal(Object.keys(verified.compared_files).length, 8);
    assert.equal(verified.skill_metadata.experts.description, "Description for experts");
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test("installation receipt rejects missing, nonexistent, or source-equal installedPath", () => {
  const fixture = installationFixture();
  try {
    assert.throws(() => fixture.verify({receipt: {}}), diagnosticKind("installation_receipt_failure"));
    assert.throws(() => fixture.verify({receipt: {installedPath: path.join(fixture.root, "absent")}}), diagnosticKind("installation_receipt_failure"));
    assert.throws(() => fixture.verify({receipt: {installedPath: fixture.source}}), diagnosticKind("installation_receipt_failure"));
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test("installed cache rejects wrong identity, missing files, and divergent content", () => {
  for (const mutate of [
    (fixture) => fixture.write(fixture.installed, ".codex-plugin/plugin.json", `${JSON.stringify({name: "wrong", version: fixture.version})}\n`),
    (fixture) => fs.rmSync(path.join(fixture.installed, "skills", "experts", "SKILL.md")),
    (fixture) => fs.rmSync(path.join(fixture.installed, "scripts", "runtime", "review-runtime.mjs")),
    (fixture) => fs.rmSync(path.join(fixture.installed, "tests", "fixtures", "reports", "v2", "regulars-clean.json")),
    (fixture) => fixture.write(fixture.installed, "skills/experts/SKILL.md", "---\nname: experts\ndescription: divergent\n---\n")
  ]) {
    const fixture = installationFixture();
    try {
      mutate(fixture);
      assert.throws(() => fixture.verify(), diagnosticKind("installed_cache_content_failure"));
    } finally {
      fs.rmSync(fixture.root, {recursive: true, force: true});
    }
  }
});

function discoveryResponse(fixture, installation, locator = ({installed_path}) => installed_path) {
  return {
    temporary_plugin_namespace: fixture.name,
    inventory_source: "system_available_skills",
    ambient_review_squad_entries: [],
    temporary_plugin_entries: Object.values(installation.skill_metadata).map((metadata) => ({skill_key: metadata.skill_key, description: metadata.description, source_locator: locator(metadata)}))
  };
}

test("fresh discovery uses exact inventory metadata while model locators remain non-authoritative", () => {
  const fixture = installationFixture();
  try {
    const installation = fixture.verify();
    const response = discoveryResponse(fixture, installation, ({name}) => path.join(fixture.root, "nonexistent-model-path", name, "SKILL.md"));
    const verified = verifyFreshSessionDiscovery({response, pluginName: fixture.name, installation});
    assert.equal(verified.status, "verified");
    assert.equal(verified.optional_model_locator_alignment, "mismatch_non_authoritative");
    assert.equal(verified.optional_model_locator_mismatches.length, 5);
    assert(verified.optional_model_locator_mismatches.every(({model_locator_exists}) => model_locator_exists === false));
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test("fresh discovery rejects unavailable, missing, duplicate, ambient, and unexpected inventory", () => {
  const fixture = installationFixture();
  try {
    const installation = fixture.verify();
    const valid = discoveryResponse(fixture, installation, () => null);
    const cases = [
      {...valid, inventory_source: "not_exposed", temporary_plugin_entries: []},
      {...valid, temporary_plugin_entries: valid.temporary_plugin_entries.slice(1)},
      {...valid, temporary_plugin_entries: [...valid.temporary_plugin_entries, valid.temporary_plugin_entries[0]]},
      {...valid, ambient_review_squad_entries: [{skill_key: "review-squad:experts", description: "ambient", source_locator: null}]},
      {...valid, temporary_plugin_entries: [...valid.temporary_plugin_entries.slice(1), {skill_key: `${fixture.name}:unexpected`, description: "unexpected", source_locator: null}]}
    ];
    for (const response of cases) assert.throws(() => verifyFreshSessionDiscovery({response, pluginName: fixture.name, installation}), diagnosticKind("fresh_session_discovery_failure"));
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test("RG-07 cleanup assessment distinguishes complete and partial cleanup", () => {
  const passing = assessRg07Cleanup({attempts: [{label: "plugin_remove", status: "passed"}, {label: "marketplace_remove", status: "passed"}], scratchRootRemoved: true, checks: {plugin_absent: "passed", marketplace_absent: "passed"}});
  assert.deepEqual(passing, {status: "passed", diagnostic: null});
  const failed = assessRg07Cleanup({attempts: [{label: "plugin_remove", status: "failed"}, {label: "marketplace_remove", status: "passed"}], scratchRootRemoved: false, checks: {plugin_absent: "failed"}});
  assert.equal(failed.status, "failed");
  assert.equal(failed.diagnostic.kind, "cleanup_failure");
  assert.deepEqual(failed.diagnostic.failed_attempts, [{label: "plugin_remove", status: "failed"}]);
});

test("bounded shutdown confirms delayed graceful exit and SIGKILL escalation", async () => {
  const fakeChild = ({exitOnStdin = false} = {}) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 12345;
    child.exitCode = null;
    child.signalCode = null;
    child.stdin = {destroyed: false, writableEnded: false, end() {
      this.writableEnded = true;
      if (exitOnStdin) setTimeout(() => {
        child.exitCode = 0;
        child.emit("exit", 0, null);
        child.emit("close", 0, null);
      }, 20);
    }};
    child.kill = (signal) => {
      if (signal === "SIGKILL") setTimeout(() => {
        child.signalCode = signal;
        child.emit("exit", null, signal);
        child.emit("close", null, signal);
      }, 20);
      return true;
    };
    return child;
  };

  const delayed = fakeChild({exitOnStdin: true});
  const graceful = await boundedShutdown(delayed, {gracefulMs: 500, termMs: 50, killMs: 500});
  assert.equal(graceful.exit_confirmed, true);
  assert.equal(graceful.sigterm_sent, false);

  let failure;
  try {
    await runBoundedProcess("mock-command", [], {timeoutMs: 20, shutdown: {gracefulMs: 10, termMs: 10, killMs: 500}, spawnImpl: () => {
      const child = fakeChild();
      setTimeout(() => child.stdout.emit("data", Buffer.from("partial\n")), 5);
      return child;
    }});
  } catch (error) {
    failure = error;
  }
  assert(failure);
  assert.equal(failure.result.diagnostic.kind, "timeout");
  assert.match(failure.result.stdout, /partial/);
  assert.equal(failure.result.shutdown.sigterm_sent, true);
  assert.equal(failure.result.shutdown.sigkill_sent, true);
  assert.equal(failure.result.shutdown.exit_confirmed, true);

  let leaked;
  try {
    await runBoundedProcess("mock-leak", [], {timeoutMs: 5, shutdown: {gracefulMs: 5, termMs: 5, killMs: 5}, spawnImpl: () => fakeChild()});
  } catch (error) {
    leaked = error;
  }
  assert.equal(leaked.result.diagnostic.kind, "leaked_process");
  assert.equal(leaked.result.shutdown.exit_confirmed, false);
  assert.equal(leaked.result.shutdown.leaked_process.status, "leaked_process_failure");
  assert.match(leaked.result.shutdown.leaked_process.warning, /Do not remove scratch data/);
});

function closedChildFixture({pid = 23456, closeAfterMs = 5} = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = null;
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => true;
  setTimeout(() => {
    child.exitCode = 0;
    child.emit("close", 0, null);
  }, closeAfterMs);
  return child;
}

function absentProcessGroup() {
  const error = new Error("process group absent");
  error.code = "ESRCH";
  throw error;
}

test("direct-child close permits descendants to drain naturally inside the bounded grace", async () => {
  let groupExists = true;
  setTimeout(() => { groupExists = false; }, 30);
  const signalFn = (_target, signal) => {
    assert.equal(signal, 0);
    if (groupExists) return true;
    return absentProcessGroup();
  };
  const result = await runBoundedProcess("mock-natural-drain", [], {
    timeoutMs: 500,
    spawnImpl: () => closedChildFixture(),
    onSpawn: (child) => { child.reviewSquadProcess = {pid: child.pid, pgid: child.pid, process_group_supported: true}; },
    shutdown: {descendantDrainMs: 100, gracefulMs: 5, termMs: 5, killMs: 5, signalFn}
  });
  assert.equal(result.process_exit_confirmed, true);
  assert.equal(result.process_tree_exit.confirmed, true);
  assert.equal(result.process_tree_exit.descendants_present_at_direct_child_close, true);
  assert.equal(result.process_tree_exit.descendants_drained_naturally, true);
});

test("direct-child close fails and boundedly cleans descendants that outlive the grace", async () => {
  let groupExists = true;
  const signalFn = (_target, signal) => {
    if (signal === 0) {
      if (groupExists) return true;
      return absentProcessGroup();
    }
    if (signal === "SIGTERM") groupExists = false;
    return true;
  };
  let failure;
  try {
    await runBoundedProcess("mock-late-descendant", [], {
      timeoutMs: 500,
      spawnImpl: () => closedChildFixture(),
      onSpawn: (child) => { child.reviewSquadProcess = {pid: child.pid, pgid: child.pid, process_group_supported: true}; },
      shutdown: {descendantDrainMs: 10, gracefulMs: 10, termMs: 50, killMs: 50, signalFn}
    });
  } catch (error) {
    failure = error;
  }
  assert(failure);
  assert.equal(failure.result.diagnostic.kind, "descendants_survived_direct_child");
  assert.equal(failure.result.diagnostic.descendant_exit_grace.confirmed, false);
  assert.equal(failure.result.shutdown.sigterm_sent, true);
  assert.equal(failure.result.shutdown.sigkill_sent, false);
  assert.equal(failure.result.shutdown.exit_confirmed, true);
});

test("direct-child close reports a leaked process when descendants survive bounded cleanup", async () => {
  const signalFn = () => true;
  let failure;
  try {
    await runBoundedProcess("mock-descendant-leak", [], {
      timeoutMs: 500,
      spawnImpl: () => closedChildFixture(),
      onSpawn: (child) => { child.reviewSquadProcess = {pid: child.pid, pgid: child.pid, process_group_supported: true}; },
      shutdown: {descendantDrainMs: 5, gracefulMs: 5, termMs: 5, killMs: 5, signalFn}
    });
  } catch (error) {
    failure = error;
  }
  assert(failure);
  assert.equal(failure.result.diagnostic.kind, "leaked_process");
  assert.equal(failure.result.diagnostic.trigger.kind, "descendants_survived_direct_child");
  assert.equal(failure.result.shutdown.sigterm_sent, true);
  assert.equal(failure.result.shutdown.sigkill_sent, true);
  assert.equal(failure.result.shutdown.exit_confirmed, false);
  assert.equal(failure.result.shutdown.leaked_process.status, "leaked_process_failure");
});

test("ordinary child and process-group exit remains an immediate confirmed pass", async () => {
  const child = closedChildFixture();
  child.exitCode = 0;
  const classification = await classifyDirectChildClose(child, {pgid: child.pid, descendantDrainMs: 25, signalFn: absentProcessGroup});
  assert.deepEqual(classification, {
    confirmed: true,
    child_exit_confirmed: true,
    process_group_exit_confirmed: true,
    descendants_present_at_direct_child_close: false,
    descendants_drained_naturally: false,
    descendant_drain_grace_ms: 25,
    code: 0,
    signal: null
  });
});

test("canonical RG-07 adjudication reproduces from the retained immutable artifacts", () => {
  const root = path.resolve("docs/plans/evidence/review-squad-0.3.0-rg07");
  const recorded = JSON.parse(fs.readFileSync(path.join(root, "adjudication.json"), "utf8"));
  const reproduced = adjudicateRg07Evidence({
    originalResultBytes: fs.readFileSync(path.join(root, "original-result.json")),
    sessionFinalBytes: fs.readFileSync(path.join(root, "session-final.json")),
    sessionJsonlBytes: fs.readFileSync(path.join(root, "session.jsonl")),
    expectedOriginalResultSha256: recorded.source_artifacts.original_result.sha256,
    originalPaths: Object.fromEntries(Object.entries(recorded.source_artifacts).map(([key, source]) => [key, source.original_path])),
    retainedPaths: Object.fromEntries(Object.entries(recorded.source_artifacts).map(([key, source]) => [key, source.retained_path])),
    adjudicatedAt: recorded.adjudicated_at
  });
  assert.deepEqual(reproduced, recorded);
  assert.equal(reproduced.verdict, "pass");
  assert.equal(reproduced.evidence_status, "passed_after_false_negative_adjudication");
  assert.equal(reproduced.execution.second_external_or_model_execution_used, false);
});

function fixtureProcesses(fixturePath) {
  return fs.readdirSync("/proc", {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .flatMap((entry) => {
      try {
        const command = fs.readFileSync(`/proc/${entry.name}/cmdline`, "utf8").replaceAll("\0", " ");
        return command.includes(fixturePath) ? [{pid: Number(entry.name), command}] : [];
      } catch {
        return [];
      }
    });
}

async function waitUntilAbsent(pids, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = pids.filter((pid) => fs.existsSync(`/proc/${pid}`));
    if (!alive.length) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual(pids.filter((pid) => fs.existsSync(`/proc/${pid}`)), [], "test-owned process survived cleanup");
}

test("real timeout kills a SIGTERM-resistant child and grandchild without leaks", {timeout: 10_000}, async () => {
  const fixturePath = path.resolve("plugins/review-squad/tests/fixtures/process/process-tree.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-process-tree-"));
  const readyPath = path.join(root, "ready.json");
  const before = fixtureProcesses(fixturePath);
  const ownedPids = [];
  let failure;
  try {
    assert.deepEqual(before, [], `fixture process existed before test: ${JSON.stringify(before)}`);
    try {
      await runBoundedProcess(process.execPath, [fixturePath, readyPath], {
        cwd: root,
        timeoutMs: 300,
        shutdown: {gracefulMs: 50, termMs: 100, killMs: 3_000}
      });
    } catch (error) {
      failure = error;
    }
    assert(failure, "real fixture unexpectedly completed");
    assert.equal(failure.result.diagnostic.kind, "timeout");
    assert(fs.existsSync(readyPath), "child did not emit its ready marker file before timeout");
    const marker = JSON.parse(fs.readFileSync(readyPath, "utf8"));
    ownedPids.push(marker.child_pid, marker.grandchild_pid);
    assert.equal(failure.result.shutdown.sigterm_sent, true);
    assert.equal(failure.result.shutdown.sigkill_sent, true);
    assert.equal(failure.result.shutdown.exit_confirmed, true);
    assert(failure.result.shutdown.signal_attempts.some(({signal, target, status}) => signal === "SIGKILL" && target === "process_group" && status === "sent"));
    await waitUntilAbsent(ownedPids);
    assert.deepEqual(fixtureProcesses(fixturePath), []);
    process.stdout.write(`# process-tree evidence ${JSON.stringify({before_count: before.length, child_pid: marker.child_pid, grandchild_pid: marker.grandchild_pid, sigkill: true, after_count: 0})}\n`);
  } finally {
    for (const pid of ownedPids) {
      try {
        const command = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
        if (command.includes(fixturePath)) process.kill(pid, "SIGKILL");
      } catch {}
    }
    await waitUntilAbsent(ownedPids);
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test("RG-07 temporary profile and argv isolate pre-existing plugins and MCP servers", () => {
  assert.deepEqual(configuredMcpServerNamesFromToml(`
[mcp_servers.serena]
[mcp_servers.serena.tools.write_memory]
[mcp_servers."design-review"]
[plugins."review-squad@test".mcp_servers.playwright]
`), ["design-review", "serena"]);
  const profile = renderFreshSessionProfile({
    pluginName: "review-squad-rg07-abc", marketplaceName: "rs-rg07-xyz",
    marketplaceRoot: "/tmp/marketplace",
    preExistingPluginIds: ["review-squad@codex-review-squad", "github@openai-curated"],
    mcpServerNames: ["serena", "design-review"]
  });
  assert.match(profile, /\[plugins\."review-squad@codex-review-squad"\]\nenabled = false/);
  assert.match(profile, /\[plugins\."github@openai-curated"\]\nenabled = false/);
  assert.match(profile, /\[plugins\."review-squad-rg07-abc@rs-rg07-xyz"\]\nenabled = true/);
  assert.match(profile, /\[plugins\."review-squad-rg07-abc@rs-rg07-xyz"\.mcp_servers\.playwright\]\nenabled = false/);
  assert.match(profile, /\[plugins\."review-squad@codex-review-squad"\.mcp_servers\.playwright\]\nenabled = false/);
  assert.match(profile, /\[mcp_servers\."design-review"\]\ncommand = "RG07_DISABLED_MCP_MUST_NOT_START"\nenabled = false/);
  assert.match(profile, /\[mcp_servers\."serena"\]\ncommand = "RG07_DISABLED_MCP_MUST_NOT_START"\nenabled = false/);
  assert.match(profile, /\[marketplaces\."rs-rg07-xyz"\]\nsource_type = "local"\nsource = "\/tmp\/marketplace"/);
  const validated = validateFreshSessionProfile({
    text: profile,
    pluginName: "review-squad-rg07-abc", marketplaceName: "rs-rg07-xyz", marketplaceRoot: "/tmp/marketplace",
    preExistingPluginIds: ["review-squad@codex-review-squad", "github@openai-curated"],
    mcpServerNames: ["serena", "design-review"]
  });
  assert.equal(validated.status, "verified");
  assert.equal(validated.unrelated_settings_or_credentials, "absent");

  for (const invalid of [
    profile.replace('[plugins."github@openai-curated"]\nenabled = false\n', ""),
    profile.replace('[plugins."review-squad-rg07-abc@rs-rg07-xyz"]\nenabled = true', '[plugins."review-squad-rg07-abc@rs-rg07-xyz"]\nenabled = false'),
    profile.replace('[mcp_servers."serena"]\ncommand = "RG07_DISABLED_MCP_MUST_NOT_START"\nenabled = false', '[mcp_servers."serena"]\ncommand = "RG07_DISABLED_MCP_MUST_NOT_START"\nenabled = true'),
    profile.replace('command = "RG07_DISABLED_MCP_MUST_NOT_START"', 'command = "ambient-command"'),
    `${profile}[credentials."copied"]\ntoken = "secret"\n`,
    profile.replace('source_type = "local"', 'source_type = "git"')
  ]) assert.throws(() => validateFreshSessionProfile({
    text: invalid,
    pluginName: "review-squad-rg07-abc", marketplaceName: "rs-rg07-xyz", marketplaceRoot: "/tmp/marketplace",
    preExistingPluginIds: ["review-squad@codex-review-squad", "github@openai-curated"],
    mcpServerNames: ["serena", "design-review"]
  }), diagnosticKind("temporary_profile_validation_failure"));

  assert.deepEqual(ambientConfigWarningsFromToml('model = "x"\napprovals_policy = "on-request"\n'), [{
    code: "RG07_AMBIENT_CONFIG_LEGACY_FIELD",
    line_number: 2,
    observed_field: "approvals_policy",
    suggested_field: "approval_policy",
    message: "Ambient Codex config uses legacy/invalid `approvals_policy`; use `approval_policy`. The field is not copied into the RG-07 profile and does not block this plugin-specific smoke test."
  }]);

  const args = buildFreshSessionArgs({
    pluginName: "review-squad-rg07-abc", marketplaceName: "rs-rg07-xyz",
    profileName: "rg07-unique-profile", mcpServerNames: ["serena", "design-review"],
    sessionCwd: "/tmp/session", responseSchemaPath: "/tmp/schema.json",
    sessionFinalPath: "/tmp/final.json", prompt: "provenance"
  });
  assert(!args.includes("--ignore-user-config"));
  assert(!args.includes("--strict-config"));
  assert.equal(args[args.indexOf("--profile") + 1], "rg07-unique-profile");
  assert(args.includes('approval_policy="never"'));
  assert(args.includes('plugins."review-squad@codex-review-squad".enabled=false'));
  assert(args.includes('plugins."review-squad@codex-review-squad".mcp_servers.playwright.enabled=false'));
  assert(args.includes('plugins."review-squad-rg07-abc@rs-rg07-xyz".enabled=true'));
  assert(!args.some((value) => value.startsWith("mcp_servers.")));
  const overrideIndex = args.indexOf('plugins."review-squad-rg07-abc@rs-rg07-xyz".mcp_servers.playwright.enabled=false');
  assert(overrideIndex > 0);
  assert.equal(args[overrideIndex - 1], "-c");
  assert.equal(args.filter((arg) => arg.includes("mcp_servers.playwright.enabled=false")).length, 2);
  assert.equal(validateFreshSessionArgs({
    args,
    pluginName: "review-squad-rg07-abc", marketplaceName: "rs-rg07-xyz",
    mcpServerNames: ["serena", "design-review"]
  }).status, "verified");
  assert.throws(() => validateFreshSessionArgs({
    args: [...args, "-c", 'mcp_servers."serena".enabled=false'],
    pluginName: "review-squad-rg07-abc", marketplaceName: "rs-rg07-xyz",
    mcpServerNames: ["serena", "design-review"]
  }), diagnosticKind("fresh_session_invocation_validation_failure"));
});

test("RG-07 discovery prompt identifies namespaces without leading expected skill names", () => {
  const pluginName = "review-squad-rg07-unique";
  const prompt = buildFreshDiscoveryPrompt(pluginName);
  assert(prompt.includes(`${pluginName}:`));
  assert(prompt.includes("review-squad:"));
  assert(prompt.includes("Available Skills section"));
  for (const skill of INSTALLED_SKILLS) assert(!prompt.includes(`${pluginName}:${skill}`));
});

test("RG-07 and evaluation schemas satisfy strict Codex output compatibility", () => {
  const rg07 = buildInstalledProvenanceSchema("review-squad-rg07-test");
  assert.deepEqual(rg07.properties.temporary_plugin_namespace, {type: "string", const: "review-squad-rg07-test"});
  assert.equal(rg07.properties.temporary_plugin_entries.items.properties.skill_key.type, "string");

  for (const schema of [
    controlledSchema("v0.3.0", ["case-a", "case-b"]),
    productionSchema("v0.3.0", "case-a", {minimum_lanes: 3, maximum_lanes: 5}),
    scorerSchema()
  ]) assert.equal(assertStrictOutputSchema(schema), schema);

  assert.deepEqual(verifyEvaluationSchemas({
    subjectIds: ["v0.2.3", "v0.3.0"],
    controlledCaseSets: [["case-a"], ["case-b"]],
    productionCaseIds: ["case-a"],
    productionContracts: {
      "v0.2.3": {minimum_lanes: 4, maximum_lanes: 8},
      "v0.3.0": {minimum_lanes: 3, maximum_lanes: 5}
    }
  }), {status: "passed_before_first_model_call", schemas_checked: 8});

  assert.throws(() => assertStrictOutputSchema({type: "object", additionalProperties: false, required: ["mode"], properties: {mode: {enum: ["x"]}}}), /explicit JSON type/);
  assert.throws(() => assertStrictOutputSchema({type: "object", additionalProperties: false, required: [], properties: {value: {type: ["string", "null"]}}}), /require every declared property/);
  assert.throws(() => assertStrictOutputSchema({type: "array"}), /items schema/);
});

test("RG-07 positional prompt closes stdin and fails fast on Codex API JSONL errors", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 23456;
  child.exitCode = null;
  child.signalCode = null;
  let stdinValue;
  child.stdin = {
    destroyed: false,
    writableEnded: false,
    end(value) {
      stdinValue = value;
      this.writableEnded = true;
      queueMicrotask(() => child.stdout.emit("data", Buffer.from(`${JSON.stringify({type: "error", message: JSON.stringify({type: "error", error: {type: "invalid_request_error", code: "invalid_json_schema", message: "schema rejected", param: "text.format.schema"}})})}\n`)));
    }
  };
  child.kill = (signal) => {
    queueMicrotask(() => {
      child.signalCode = signal;
      child.emit("exit", null, signal);
      child.emit("close", null, signal);
    });
    return true;
  };

  const started = Date.now();
  let failure;
  try {
    await runBoundedProcess("codex", ["exec", "prompt"], {
      timeoutMs: 10_000,
      stdin: "",
      spawnImpl: () => child,
      shutdown: {gracefulMs: 5, termMs: 100, killMs: 100},
      onStdout: createCodexJsonlFailureMonitor({source: "RG-07 fixture"})
    });
  } catch (error) {
    failure = error;
  }
  assert(failure);
  assert.equal(stdinValue, "", "positional-prompt invocation must receive immediate EOF");
  assert(Date.now() - started < 1_000, "JSONL failure must not wait for the command timeout");
  assert.equal(failure.result.diagnostic.kind, "codex_api_error");
  assert.equal(failure.result.diagnostic.code, "invalid_json_schema");
  assert.equal(failure.result.diagnostic.message, "schema rejected");
  assert.equal(failure.result.shutdown.exit_confirmed, true);
  assert.match(failure.result.stdout, /invalid_json_schema/);
});

test("malformed or truncated JSONL is a structured synchronous failure", () => {
  assert.deepEqual(parseJsonl('{"type":"thread.started"}\n{"type":"turn.completed"}\n'), [{type: "thread.started"}, {type: "turn.completed"}]);
  assert.throws(() => parseJsonl('{"type":"thread.started"}\n{"type":', {source: "fixture"}), (error) => {
    assert.equal(error.diagnostic.kind, "invalid_jsonl");
    assert.equal(error.diagnostic.source, "fixture");
    assert.equal(error.diagnostic.line_number, 2);
    return true;
  });
});

function scoringFixture() {
  const reviewOutputs = [
    {phase: "controlled_quality", call_id: "controlled-v03-a", subject: "v0.3.0", allocated_case_ids: ["case-a"], final: {case_results: [{case_id: "case-a", findings: [{severity: "critical", evidence: [{}]}]}]}},
    {phase: "production_behavior", call_id: "production-v03-a", subject: "v0.3.0", final: {case_id: "case-a", lane_results: [
      {lane_id: "SEC", completion: "completed", raw_findings: [{severity: "critical", evidence: [{}]}]},
      {lane_id: "ARCH", completion: "completed", raw_findings: [{severity: "critical", evidence: [{}]}]}
    ]}, delegation_mapping: {
      status: "verified", raw_payload_provenance: "verified", raw_artifact: "/tmp/delegations.json",
      raw_artifact_sha256: "a".repeat(64), links: [{verified: true}, {verified: true}]
    }}
  ];
  const findings = flattenReviewFindings(reviewOutputs);
  const ledger = findings.map((finding) => ({phase: finding.phase, call_id: finding.call_id, case_id: finding.case_id, finding_index: finding.finding_index, root_id: "root-a", evidence_valid: true, severity_exact: true}));
  const expectations = {cases: {"case-a": {expected_findings: [{id: "root-a", severity: "critical"}]}}};
  return {reviewOutputs, findings, ledger, expectations};
}

test("ledger completeness, allowed roots, and phase identity are enforced", () => {
  const fixture = scoringFixture();
  assert.equal(new Set(fixture.findings.map(findingIdentity)).size, 3, "controlled and production phases must not collide");
  assert.equal(validateScoringLedger(fixture).length, 3);
  assert.throws(() => validateScoringLedger({...fixture, ledger: fixture.ledger.slice(1)}), /omitted/);
  assert.throws(() => validateScoringLedger({...fixture, ledger: [...fixture.ledger, fixture.ledger[0]]}), /duplicate/);
  assert.throws(() => validateScoringLedger({...fixture, ledger: fixture.ledger.map((row, index) => index === 0 ? {...row, finding_index: 99} : row)}), /invented/);
  assert.throws(() => validateScoringLedger({...fixture, ledger: fixture.ledger.map((row, index) => index === 0 ? {...row, root_id: "other-case-root"} : row)}), /not allowed/);
  const metrics = computeDeterministicMetrics(fixture);
  assert.equal(metrics.production_behavior["v0.3.0"].duplicate_instances_from_raw_lanes, 1);
  for (const delegation_mapping of [
    {...fixture.reviewOutputs[1].delegation_mapping, status: "not_verified"},
    {...fixture.reviewOutputs[1].delegation_mapping, raw_payload_provenance: "not_verified"},
    {...fixture.reviewOutputs[1].delegation_mapping, raw_artifact_sha256: null},
    {...fixture.reviewOutputs[1].delegation_mapping, links: [{verified: true}, {verified: false}]}
  ]) {
    const reviewOutputs = structuredClone(fixture.reviewOutputs);
    reviewOutputs[1].delegation_mapping = delegation_mapping;
    const rejected = computeDeterministicMetrics({...fixture, reviewOutputs});
    assert.equal(rejected.production_behavior["v0.3.0"].duplicate_metric_status, "not_verified");
    assert.equal(rejected.production_behavior["v0.3.0"].duplicate_instances_from_raw_lanes, null);
  }
});

test("controlled responses require exact immutable allocation coverage", () => {
  const allocated = ["case-a", "case-b"];
  const final = {case_results: [{case_id: "case-a"}, {case_id: "case-b"}]};
  assert.deepEqual(validateControlledCaseCoverage(final, allocated), allocated);
  assert.throws(() => validateControlledCaseCoverage({case_results: [{case_id: "case-a"}, {case_id: "case-a"}]}, allocated), /duplicated/);
  assert.throws(() => validateControlledCaseCoverage({case_results: [{case_id: "case-a"}]}, allocated), /omitted/);
  assert.throws(() => validateControlledCaseCoverage({case_results: [{case_id: "case-a"}, {case_id: "case-c"}]}, allocated), /unallocated/);
});

test("independent scorer disagreements are exact and never averaged", () => {
  const {ledger} = scoringFixture();
  assert.deepEqual(compareScoringLedgers(ledger, structuredClone(ledger)), {agreed: true, disagreements: []});
  const changed = structuredClone(ledger);
  changed[0].root_id = "unsupported";
  const comparison = compareScoringLedgers(ledger, changed);
  assert.equal(comparison.agreed, false);
  assert.equal(comparison.disagreements.length, 1);
  assert.equal(comparison.disagreements[0].scorer_a.root_id, "root-a");
  assert.equal(comparison.disagreements[0].scorer_b.root_id, "unsupported");
});

test("production contracts preserve release-specific fan-out and tier policy", () => {
  assert.deepEqual(PRODUCTION_CONTRACTS["v0.2.3"], {minimum_lanes: 4, maximum_lanes: 8, dispatch: "shipped default panel of 4-8 reviewers", tier_policy: "shipped v0.2.3 effort policy; medium by default and high/low only where its instructions require"});
  assert.deepEqual(PRODUCTION_CONTRACTS["v0.3.0"], {minimum_lanes: 3, maximum_lanes: 5, dispatch: "three evidence-selected initial lanes with evidence-based escalation capped at five", tier_policy: "shipped v0.3.0 Sol/high, Terra/medium, and Terra/low lane policy"});
  assert.equal(3 * PRODUCTION_CONTRACTS["v0.2.3"].maximum_lanes + 3 * PRODUCTION_CONTRACTS["v0.3.0"].maximum_lanes, 39);
});

test("delegation detection deduplicates lifecycle events and usage stays field-level", () => {
  const secPayload = {raw_findings: [{severity: "critical", title: "SEC", description: "security", evidence: [{path: "a", detail: "b"}]}]};
  const archPayload = {raw_findings: [{severity: "important", title: "ARCH", description: "architecture", evidence: [{path: "c", detail: "d"}]}]};
  const events = [
    {type: "item.started", item: {id: "call-1", tool_name: "spawn_agent"}},
    {type: "item.completed", item: {id: "call-1", tool_name: "spawn_agent", agent_id: "agent-sec", result: secPayload}},
    {type: "item.completed", item: {id: "call-2", name: "spawn_agent", agent_id: "agent-arch", result: archPayload}}
  ];
  assert.equal(delegationEvents(events).length, 2);
  const lanes = [
    {lane_id: "SEC", delegation_call_id: "call-1", returned_agent_id: "agent-sec", returned_task_name: null, raw_delegated_response: secPayload, raw_findings: secPayload.raw_findings},
    {lane_id: "ARCH", delegation_call_id: "call-2", returned_agent_id: "agent-arch", returned_task_name: null, raw_delegated_response: archPayload, raw_findings: archPayload.raw_findings}
  ];
  assert.equal(linkDelegationResults(delegationEvents(events), lanes).status, "verified");
  assert.equal(linkDelegationResults(delegationEvents(events), lanes.map((lane) => ({...lane, delegation_call_id: null}))).status, "not_verified");
  assert.equal(linkDelegationResults(delegationEvents(events), lanes.map((lane, index) => index ? lane : {...lane, raw_delegated_response: null})).status, "not_verified");
  assert.equal(linkDelegationResults(delegationEvents(events), lanes.map((lane, index) => index ? lane : {...lane, raw_delegated_response: {...secPayload, changed: true}})).status, "not_verified");
  assert.equal(linkDelegationResults(delegationEvents(events).map((item, index) => index ? item : {...item, raw_response: null}), lanes).status, "not_verified");
  assert.equal(linkDelegationResults(delegationEvents(events), lanes.map((lane, index) => index ? lane : {...lane, raw_findings: []})).status, "not_verified");
  assert.deepEqual(usageFields({input_tokens: 10, output_tokens: 2}), {status: "observed", input_tokens: 10, cached_input_tokens: null, output_tokens: 2, reasoning_output_tokens: null, field_status: {input_tokens: "observed", cached_input_tokens: "not_verified", output_tokens: "observed", reasoning_output_tokens: "not_verified"}});
  assert.equal(usageFields(null).status, "not_verified");
  assert.equal("total_tokens" in usageFields({input_tokens: 1}), false);
  assert.equal(classifyTokenAccounting([...events, {type: "turn.completed", usage: {input_tokens: 1}}]).classification, "semantically_unknown");
  assert.equal(classifyTokenAccounting([...events, {type: "turn.completed", usage: {input_tokens: 1, includes_delegated: true}}]).classification, "aggregate_including_delegated");
  const primary = {type: "turn.completed", usage: {input_tokens: 1}};
  const identifiedUsage = [{delegation_call_id: "call-2", delegated_usage: {input_tokens: 3}}, {delegation_call_id: "call-1", delegated_usage: {input_tokens: 2}}];
  assert.equal(classifyTokenAccounting([...events, primary, ...identifiedUsage]).classification, "primary_plus_independently_exposed_delegated", "reordered identity-linked usage remains verifiable");
  assert.equal(classifyTokenAccounting([...events, primary, {delegation_call_id: "call-1", delegated_usage: {input_tokens: 2}}, {delegation_call_id: "call-1", delegated_usage: {input_tokens: 3}}]).classification, "semantically_unknown", "duplicated usage identity must fail");
  assert.equal(classifyTokenAccounting([...events, primary, {delegated_usage: {input_tokens: 2}}, {delegated_usage: {input_tokens: 3}}]).classification, "semantically_unknown", "anonymous usage must fail");
  assert.equal(classifyTokenAccounting([...events, primary, identifiedUsage[0]]).classification, "semantically_unknown", "missing delegated usage must fail");
});

test("pilot retains unobservable delegation as not verified while full evaluation stays strict", () => {
  const lanes = ["SEC", "REL", "API"].map((lane_id) => ({lane_id, delegation_call_id: null, raw_findings: []}));
  const pilotMapping = assessDelegationObservation({delegations: [], laneResults: lanes, minimum: 3, maximum: 3, allowUnobservable: true});
  assert.equal(pilotMapping.status, "not_verified");
  assert.match(pilotMapping.reason, /stable delegation_call_id/);
  assert.throws(() => assessDelegationObservation({delegations: [], laneResults: lanes, minimum: 3, maximum: 3}), /expected 3-3/);
  assert.throws(() => assessDelegationObservation({delegations: [{call_id: "a"}, {call_id: "b"}, {call_id: "c"}, {call_id: "d"}], laneResults: lanes, minimum: 3, maximum: 3, allowUnobservable: true}), /authorized ceiling/);
});

test("canonical pilot adjudication reproduces as completed-not-verified", () => {
  const root = path.resolve("docs/plans/evidence/review-squad-0.3.0-pilot");
  const recorded = JSON.parse(fs.readFileSync(path.join(root, "adjudication.json"), "utf8"));
  const artifacts = Object.fromEntries(Object.entries(recorded.source_artifacts).map(([key, source]) => [key, fs.readFileSync(path.resolve(source.retained_path))]));
  const reproduced = adjudicatePilotEvidence({
    artifacts,
    originalPaths: Object.fromEntries(Object.entries(recorded.source_artifacts).map(([key, source]) => [key, source.original_path])),
    retainedPaths: Object.fromEntries(Object.entries(recorded.source_artifacts).map(([key, source]) => [key, source.retained_path])),
    adjudicatedAt: recorded.adjudicated_at
  });
  assert.deepEqual(reproduced, recorded);
  assert.equal(reproduced.verdict, "completed_not_verified");
  assert.equal(reproduced.compatibility.raw_delegated_payload_provenance, "not_verified");
  assert.equal(reproduced.execution.retry_used, false);
});

test("ambient isolation and pilot prerequisite false-pass states remain not verified", () => {
  const cleanAmbient = assessAmbientReviewSquadIsolation({ambient_review_squad: {inventory_source: "system_available_skills", skill_locators: []}});
  assert.equal(cleanAmbient.status, "verified");
  assert.equal(assessAmbientReviewSquadIsolation({ambient_review_squad: {inventory_source: "not_exposed", skill_locators: []}}).status, "not_verified");
  assert.equal(assessAmbientReviewSquadIsolation({ambient_review_squad: {inventory_source: "system_available_skills", skill_locators: ["/ambient/review-squad/SKILL.md"]}}).status, "not_verified");

  const delegations = ["a", "b", "c"].map((call_id) => ({call_id}));
  const verifiedMapping = {
    status: "verified", identities_unique: true, raw_payload_provenance: "verified",
    raw_artifact: "/tmp/pilot/delegation-events.json", raw_artifact_sha256: "b".repeat(64),
    links: delegations.map(({call_id}, index) => ({delegation_call_id: call_id, observed_identity: `agent-${index}`, verified: true}))
  };
  const base = {events: [{type: "turn.completed"}], delegations, delegationMapping: verifiedMapping, ambientIsolation: cleanAmbient, laneResults: delegations.map(() => ({raw_findings: []})), usageStatus: "observed"};
  assert.equal(pilotCompatibilityVerdict(base).status, "pilot_passed_non_release");
  assert.equal(pilotCompatibilityVerdict({...base, delegationMapping: {...verifiedMapping, status: "not_verified"}}).status, "completed_not_verified");
  assert.equal(pilotCompatibilityVerdict({...base, delegations: [{call_id: "a"}, {call_id: "a"}, {call_id: "c"}]}).status, "completed_not_verified");
  assert.equal(pilotCompatibilityVerdict({...base, delegationMapping: {...verifiedMapping, links: verifiedMapping.links.map((link, index) => index ? link : {...link, observed_identity: null})}}).status, "completed_not_verified");
  assert.equal(pilotCompatibilityVerdict({...base, delegationMapping: {...verifiedMapping, raw_artifact_sha256: null}}).status, "completed_not_verified");
  assert.equal(pilotCompatibilityVerdict({...base, ambientIsolation: {status: "not_verified", ambient_skill_locators: ["/ambient/SKILL.md"]}}).status, "completed_not_verified");

  const fingerprint = {protocol: "current"};
  const passingPilot = {
    mode: "pilot", status: "pilot_passed_non_release", protocol_fingerprint: fingerprint,
    pilot_checks: {delegation_mapping: "verified", top_level_delegation_identities: "verified", raw_delegated_payload_provenance: "verified", ambient_review_squad_isolation: "verified"},
    calls: [{observed_delegated_calls: 3, authorized_delegation_ceiling: 3, ambient_review_squad_isolation: {status: "verified"}, delegation_mapping: verifiedMapping}]
  };
  assert.equal(validatePilotPrerequisiteRecord(passingPilot, fingerprint).status, "validated_before_full_run");
  assert.throws(() => validatePilotPrerequisiteRecord({...passingPilot, status: "completed_not_verified"}, fingerprint), /not a compatible successful pilot/);
  assert.throws(() => validatePilotPrerequisiteRecord({...passingPilot, protocol_fingerprint: {protocol: "stale"}}, fingerprint), /current protocol hashes/);
  assert.throws(() => validatePilotPrerequisiteRecord({...passingPilot, pilot_checks: {...passingPilot.pilot_checks, raw_delegated_payload_provenance: "not_verified"}}, fingerprint), /raw delegated payload provenance/);
  assert.throws(() => validatePilotPrerequisiteRecord({...passingPilot, calls: [{...passingPilot.calls[0], delegation_mapping: {...verifiedMapping, links: verifiedMapping.links.map((link, index) => index ? link : {...link, observed_identity: verifiedMapping.links[1].observed_identity})}}]}, fingerprint), /identities.*duplicated/);
  assert.throws(() => validatePilotPrerequisiteRecord({...passingPilot, calls: [{...passingPilot.calls[0], delegation_mapping: {...verifiedMapping, raw_artifact_sha256: null}}]}, fingerprint), /artifact SHA-256/);

  const pilotRoot = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-pilot-prerequisite-"));
  try {
    const evidenceFile = path.join(pilotRoot, "result.json");
    const artifact = path.join(pilotRoot, "raw", "delegation-events.json");
    fs.mkdirSync(path.dirname(artifact));
    fs.writeFileSync(artifact, "retained raw delegation evidence\n");
    const artifactHash = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
    const withArtifact = structuredClone(passingPilot);
    withArtifact.calls[0].delegation_mapping.raw_artifact = artifact;
    withArtifact.calls[0].delegation_mapping.raw_artifact_sha256 = artifactHash;
    assert.equal(validatePilotPrerequisiteRecord(withArtifact, fingerprint, {evidenceFile}).raw_delegation_artifact, artifact);
    assert.throws(() => validatePilotPrerequisiteRecord({...withArtifact, calls: [{...withArtifact.calls[0], delegation_mapping: {...withArtifact.calls[0].delegation_mapping, raw_artifact_sha256: "c".repeat(64)}}]}, fingerprint, {evidenceFile}), /hash mismatch/);
    assert.throws(() => validatePilotPrerequisiteRecord({...withArtifact, calls: [{...withArtifact.calls[0], delegation_mapping: {...withArtifact.calls[0].delegation_mapping, raw_artifact: "/tmp/outside-pilot-evidence.json"}}]}, fingerprint, {evidenceFile}), /outside its evidence directory/);
  } finally {
    fs.rmSync(pilotRoot, {recursive: true, force: true});
  }
});
