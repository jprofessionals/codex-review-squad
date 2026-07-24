#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  assessAmbientReviewSquadIsolation,
  assessDelegationObservation,
  compareScoringLedgers,
  classifyTokenAccounting,
  computeDeterministicMetrics,
  delegationEvents,
  flattenReviewFindings,
  pilotCompatibilityVerdict,
  PRODUCTION_CONTRACTS,
  usageFields,
  validateControlledCaseCoverage,
  validatePilotPrerequisiteRecord,
  validateScoringLedger
} from "./lib/evaluation-protocol.mjs";
import {controlledSchema, productionSchema, scorerSchema, verifyEvaluationSchemas} from "./lib/evaluation-schemas.mjs";
import {ambientReviewSquadDisableArgs} from "./lib/installed-provenance.mjs";
import {createCodexJsonlFailureMonitor, parseJsonl, runBoundedProcess} from "./lib/process-control.mjs";

const usage = "Usage: node run-evaluation.mjs --plan | --pilot-plan | --authorized --pilot-evidence <absolute-/tmp/result.json> --output <new-absolute-/tmp/directory> | --pilot-authorized --output <new-absolute-/tmp/directory>";
const MODEL = "gpt-5.6-sol";
const EFFORT = "high";
const CALL_TIMEOUT_MS = 20 * 60 * 1000;
const FULL_PRIMARY_CALLS = 12;
const FULL_DELEGATED_CEILING = 39;
const PILOT_PRIMARY_CALLS = 1;
const PILOT_DELEGATED_CALLS = 3;
const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");
const evalRoot = path.join(pluginRoot, "tests", "eval");

function outputArg(argv, mode) {
  if (argv.length !== 3 || argv[0] !== mode || argv[1] !== "--output") return null;
  const output = path.resolve(argv[2]);
  if (!path.isAbsolute(argv[2]) || !output.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error("--output must be a new absolute directory below /tmp");
  return output;
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return {help: true};
  if (argv.length === 1 && argv[0] === "--plan") return {plan: true};
  if (argv.length === 1 && argv[0] === "--pilot-plan") return {pilotPlan: true};
  if (argv.length === 5 && argv[0] === "--authorized" && argv[1] === "--pilot-evidence" && argv[3] === "--output") {
    const pilotEvidence = path.resolve(argv[2]);
    const output = path.resolve(argv[4]);
    if (!path.isAbsolute(argv[2]) || !pilotEvidence.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error("--pilot-evidence must be an absolute JSON path below /tmp");
    if (!path.isAbsolute(argv[4]) || !output.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error("--output must be a new absolute directory below /tmp");
    return {authorized: true, pilotEvidence, output};
  }
  const pilot = outputArg(argv, "--pilot-authorized");
  if (pilot) return {pilot: true, output: pilot};
  throw new Error(usage);
}

const fullPlan = {
  command: "node plugins/review-squad/scripts/run-evaluation.mjs --authorized --pilot-evidence /tmp/review-squad-eval-pilot-0.3.0/result.json --output /tmp/review-squad-eval-0.3.0",
  enforced_prerequisite: "a current pilot result with verified ambient isolation, exactly three stable one-to-one delegation identities, untouched raw delegated payload provenance, and an in-directory retained raw artifact matching its SHA-256",
  invocation_local_isolation: ["--ignore-user-config", "plugins.\"review-squad@codex-review-squad\".enabled=false", "plugins.\"review-squad@codex-review-squad\".mcp_servers.playwright.enabled=false", "every model response must report an exposed and empty ambient Review Squad skill-locator inventory"],
  release_evidence: true,
  phases: [
    {phase: "controlled_quality", design: "same neutral wrapper, blinded allocation, gpt-5.6-sol/high primary, no delegation", primary_calls: 4, delegated_calls: 0},
    {phase: "production_behavior_v0.2.3", design: PRODUCTION_CONTRACTS["v0.2.3"], samples: 3, primary_calls: 3, delegated_call_ceiling: 24},
    {phase: "production_behavior_v0.3.0", design: PRODUCTION_CONTRACTS["v0.3.0"], samples: 3, primary_calls: 3, delegated_call_ceiling: 15},
    {phase: "independent_scoring", design: "two independent ledgers; deterministic validation, comparison, and arithmetic", primary_calls: 2, delegated_calls: 0}
  ],
  total_primary_model_calls: FULL_PRIMARY_CALLS,
  production_behavior_primary_calls: 6,
  production_behavior_delegated_call_ceiling: FULL_DELEGATED_CEILING,
  production_behavior_maximum_total_calls: 6 + FULL_DELEGATED_CEILING,
  maximum_total_delegated_calls: FULL_DELEGATED_CEILING,
  configured_top_level_maximum_model_calls: FULL_PRIMARY_CALLS + FULL_DELEGATED_CEILING,
  runtime_proven_global_maximum_model_calls: null,
  global_model_call_ceiling_status: "not_verified; the ordinary pilot does not deliberately exercise nested delegation, so 51 is only a configured top-level limit",
  disagreement_adjudication: "not automatic; a separately authorized adjudicator would make the configured top-level maximum 52 while the runtime-proven global maximum remains unknown",
  requested_primary_model: MODEL,
  requested_primary_reasoning_effort: EFFORT,
  expected_duration: "approximately 60-120 minutes",
  estimated_evidence_volume: "approximately 15-40 MB",
  statistical_limit: "three production samples per subject are descriptive only; controlled-quality and production metrics stay separate"
};

const pilotPlan = {
  command: "node plugins/review-squad/scripts/run-evaluation.mjs --pilot-authorized --output /tmp/review-squad-eval-pilot-0.3.0",
  release_evidence: false,
  oracle_opened: false,
  scoring_calls: 0,
  configured_top_level_primary_calls: PILOT_PRIMARY_CALLS,
  configured_top_level_delegated_calls: PILOT_DELEGATED_CALLS,
  configured_top_level_maximum_calls: PILOT_PRIMARY_CALLS + PILOT_DELEGATED_CALLS,
  runtime_proven_global_maximum_calls: null,
  invocation_local_isolation: ["--ignore-user-config", "plugins.\"review-squad@codex-review-squad\".enabled=false", "plugins.\"review-squad@codex-review-squad\".mcp_servers.playwright.enabled=false", "the pilot stops as completed_not_verified unless the system Available Skills inventory is exposed and has no ambient Review Squad locator"],
  requested_primary_model: MODEL,
  requested_primary_reasoning_effort: EFFORT,
  checks: ["actual Codex JSONL shape", "three stable unique spawn_agent identities and one-to-one lane mapping", "untouched delegated payload and raw-findings equality against retained JSONL", "retained raw delegation artifact path and SHA-256", "ambient Review Squad skill inventory is exposed and empty", "structured final parsing", "turn.completed.usage field capture and semantic scope classification", "bounded child/grandchild timeout with SIGTERM/SIGKILL escalation"],
  expected_duration: "approximately 5-15 minutes",
  estimated_evidence_volume: "approximately 1-5 MB",
  warning: "pilot success is harness compatibility evidence only and cannot satisfy RG-04 or RG-05; this ordinary pilot does not prove nested-delegation observability"
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
  process.stdout.write(`${JSON.stringify(fullPlan, null, 2)}\n`);
  process.exit(0);
}
if (parsed.pilotPlan) {
  process.stdout.write(`${JSON.stringify(pilotPlan, null, 2)}\n`);
  process.exit(0);
}
if (fs.existsSync(parsed.output)) {
  console.error("--output must not already exist");
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const subjectsPath = path.join(evalRoot, "subjects-v1.json");
const corpusPath = path.join(evalRoot, "corpus.json");
const allocationPath = path.join(evalRoot, "allocation-v1.json");
const reproducibilityPath = path.join(evalRoot, "reproducibility.json");
const subjects = readJson(subjectsPath);
const corpus = readJson(corpusPath);
const allocation = readJson(allocationPath);
const reproducibility = readJson(reproducibilityPath);
const abortController = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => abortController.abort(new Error(`interrupted by ${signal}`)));
const wrapperFiles = {
  controlled_quality: "reviewer-prompt-v2.md",
  production_behavior: "production-review-prompt-v2.md",
  independent_scoring: "scorer-prompt-v2.md",
  pilot: "pilot-prompt-v1.md"
};
const wrappers = Object.fromEntries(Object.entries(wrapperFiles).map(([key, file]) => [key, fs.readFileSync(path.join(evalRoot, file), "utf8")]));

function gitShow(commit, relativePath) {
  const result = spawnSync("git", ["show", `${commit}:${relativePath}`], {cwd: repoRoot, encoding: null, maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`git show failed for ${commit}:${relativePath}: ${result.stderr}`);
  return result.stdout;
}

function materializeSubjects(root) {
  const evidence = {};
  for (const [subjectId, subject] of Object.entries(subjects.subjects)) {
    const subjectRoot = path.join(root, subjectId);
    fs.mkdirSync(subjectRoot, {recursive: true});
    evidence[subjectId] = {source: subject.source, files: {}};
    for (const [relativePath, expectedHash] of Object.entries(subject.files)) {
      const content = subject.source.kind === "git_commit" ? gitShow(subject.source.commit, relativePath) : fs.readFileSync(path.join(repoRoot, relativePath));
      assert.equal(hash(content), expectedHash, `${subjectId} hash mismatch: ${relativePath}`);
      const destination = path.join(subjectRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), {recursive: true});
      fs.writeFileSync(destination, content);
      evidence[subjectId].files[relativePath] = {sha256: expectedHash, bytes: content.length};
    }
  }
  return evidence;
}

function verifyProtocol(subjectRoot) {
  const protocol = reproducibility.future_protocol;
  assert.equal(protocol.evaluation_skill, subjects.evaluation_skill);
  assert.equal(protocol.baseline_commit, subjects.subjects["v0.2.3"].source.commit);
  assert.equal(hash(fs.readFileSync(subjectsPath)), protocol.subject_manifest.sha256, "subject manifest hash mismatch");
  assert.equal(path.basename(subjectsPath), protocol.subject_manifest.file);
  for (const [name, declaration] of Object.entries(protocol.wrappers)) {
    assert.equal(declaration.file, wrapperFiles[name], `${name} wrapper filename mismatch`);
    assert.equal(hash(fs.readFileSync(path.join(evalRoot, declaration.file))), declaration.sha256, `${name} wrapper hash mismatch`);
  }
  for (const [key, file] of [["corpus", corpusPath], ["allocation", allocationPath]]) {
    assert.equal(hash(fs.readFileSync(file)), protocol[key].sha256, `${key} hash mismatch`);
  }
  assert.deepEqual(protocol.production_contracts, PRODUCTION_CONTRACTS, "production dispatch metadata differs from runner contracts");
  assert.deepEqual(protocol.requested_runtime, {primary_model: MODEL, primary_reasoning_effort: EFFORT, sandbox: "read-only", ephemeral: true, ignore_user_config: true, ambient_plugin_overrides: ambientReviewSquadDisableArgs().filter((_, index) => index % 2 === 1)});
  assert.equal(protocol.run_matrix.controlled_quality.primary_calls, 4);
  assert.equal(protocol.run_matrix.controlled_quality.delegated_calls, 0);
  assert.equal(protocol.run_matrix["production_behavior_v0.2.3"].maximum_delegated_calls, 24);
  assert.equal(protocol.run_matrix["production_behavior_v0.3.0"].maximum_delegated_calls, 15);
  assert.equal(protocol.run_matrix.total_primary_calls, FULL_PRIMARY_CALLS);
  assert.equal(protocol.run_matrix.production_behavior_maximum_total_calls, 6 + FULL_DELEGATED_CEILING);
  assert.equal(protocol.run_matrix.maximum_total_delegated_calls, FULL_DELEGATED_CEILING);
  assert.equal(protocol.run_matrix.configured_top_level_maximum_calls, FULL_PRIMARY_CALLS + FULL_DELEGATED_CEILING);
  assert.equal(protocol.run_matrix.runtime_proven_global_maximum_calls, null);
  assert.equal(protocol.pilot.configured_top_level_primary_calls, PILOT_PRIMARY_CALLS);
  assert.equal(protocol.pilot.configured_top_level_delegated_calls, PILOT_DELEGATED_CALLS);
  assert.equal(protocol.pilot.configured_top_level_maximum_calls, PILOT_PRIMARY_CALLS + PILOT_DELEGATED_CALLS);
  assert.equal(protocol.pilot.runtime_proven_global_maximum_calls, null);
  assert.equal(protocol.pilot.oracle_opened, false);
  const structuredOutputSchemas = verifyEvaluationSchemas({
    subjectIds: Object.keys(subjects.subjects),
    controlledCaseSets: Object.values(allocation.reviewers),
    productionCaseIds: ["web-seeded", "backend-seeded", "infrastructure-seeded"],
    productionContracts: PRODUCTION_CONTRACTS
  });
  const manifest = readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
  assert.equal(manifest.name, subjects.subjects["v0.3.0"].source.required_manifest_name);
  assert.equal(manifest.version, subjects.subjects["v0.3.0"].source.required_manifest_version);
  const materialization = materializeSubjects(subjectRoot);
  for (const [subjectId, subject] of Object.entries(subjects.subjects)) {
    const materializedManifest = readJson(path.join(subjectRoot, subjectId, "plugins", "review-squad", ".codex-plugin", "plugin.json"));
    assert.equal(materializedManifest.name, subject.source.required_manifest_name, `${subjectId} materialized manifest name mismatch`);
    assert.equal(materializedManifest.version, subject.source.required_manifest_version, `${subjectId} materialized manifest version mismatch`);
  }
  return {status: "passed_before_first_model_call", reproducibility_schema: reproducibility.schema_version, structured_output_schemas: structuredOutputSchemas, manifest: {name: manifest.name, version: manifest.version}, materialization};
}

function protocolFingerprint() {
  return {
    reproducibility_sha256: hash(fs.readFileSync(reproducibilityPath)),
    subject_manifest_sha256: hash(fs.readFileSync(subjectsPath)),
    corpus_sha256: hash(fs.readFileSync(corpusPath)),
    allocation_sha256: hash(fs.readFileSync(allocationPath)),
    wrapper_sha256: Object.fromEntries(Object.entries(wrapperFiles).map(([name, file]) => [name, hash(fs.readFileSync(path.join(evalRoot, file)))]))
  };
}

function validatePilotPrerequisite(file, expectedFingerprint) {
  const pilot = readJson(file);
  const validation = validatePilotPrerequisiteRecord(pilot, expectedFingerprint, {evidenceFile: file});
  return {path: file, sha256: hash(fs.readFileSync(file)), protocol_fingerprint: expectedFingerprint, ...validation};
}

function subjectBlock(subjectId, subjectRoot) {
  return Object.keys(subjects.subjects[subjectId].files).sort().map((relativePath) => `\n===== MODEL-VISIBLE SUBJECT FILE: ${relativePath} =====\n${fs.readFileSync(path.join(subjectRoot, subjectId, relativePath), "utf8")}\n===== END SUBJECT FILE =====\n`).join("");
}

function caseBlock(caseIds) {
  return caseIds.map((caseId) => {
    const item = corpus.cases.find(({id}) => id === caseId);
    assert(item, `unknown case ${caseId}`);
    return `\n===== BLINDED CASE ${caseId} (${item.surface}) =====${Object.entries(item.artifacts).map(([file, content]) => `\n--- ${file} ---\n${content}`).join("")}\n===== END CASE ${caseId} =====\n`;
  }).join("");
}

function findMetadata(events, keys) {
  const visit = (value) => {
    if (!value || typeof value !== "object") return null;
    for (const [key, child] of Object.entries(value)) {
      if (keys.includes(key) && typeof child === "string") return child;
      const nested = visit(child);
      if (nested) return nested;
    }
    return null;
  };
  for (const event of events.filter(({type}) => type === "thread.started" || type === "turn.started")) {
    const found = visit(event);
    if (found) return found;
  }
  return null;
}

function workflowUsage(primaryUsage, tokenAccounting) {
  const primary = usageFields(primaryUsage);
  if (tokenAccounting.classification === "aggregate_including_delegated" && tokenAccounting.status === "verified") {
    return {...primary, semantic_status: "verified_aggregate_including_delegated"};
  }
  if (tokenAccounting.classification !== "primary_plus_independently_exposed_delegated" || tokenAccounting.status !== "verified") {
    return {status: "not_verified", semantic_status: tokenAccounting.classification, reason: "complete workflow usage is not proven"};
  }
  const components = [primary, ...tokenAccounting.delegated_usage_events.map(({usage}) => usageFields(usage))];
  const fields = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];
  const totals = Object.fromEntries(fields.map((field) => {
    const values = components.map((item) => item[field]);
    return [field, values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null];
  }));
  return {status: "observed", semantic_status: "verified_primary_plus_independently_exposed_delegated", ...totals, field_status: Object.fromEntries(fields.map((field) => [field, Number.isFinite(totals[field]) ? "observed" : "not_verified"]))};
}

function copyTree(source, destination, manifest, prefix = "") {
  if (!source) return;
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const relative = path.join(prefix, entry.name);
    const from = path.join(source, entry.name);
    const to = path.join(destination, relative);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, {recursive: true});
      copyTree(from, destination, manifest, relative);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), {recursive: true});
      const content = fs.readFileSync(from);
      fs.writeFileSync(to, content);
      manifest.push({path: relative, sha256: hash(content), bytes: content.length});
    }
  }
}

async function runCodex({id, phase, subject, targetSource = null, prompt, schema, rawRoot, expectedDelegation, allowUnobservableDelegation = false}) {
  const callRoot = path.join(rawRoot, id);
  fs.mkdirSync(callRoot, {recursive: true});
  const paths = Object.fromEntries(["prompt.txt", "output.schema.json", "events.jsonl", "stderr.txt", "final.json", "delegation-events.json", "call.json", "input-manifest.json", "effective-argv.json"].map((name) => [name, path.join(callRoot, name)]));
  fs.writeFileSync(paths["prompt.txt"], prompt);
  fs.writeFileSync(paths["output.schema.json"], `${JSON.stringify(schema, null, 2)}\n`);
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), ".review-squad-eval-call-"));
  const inputManifest = [];
  copyTree(targetSource, scratchRoot, inputManifest);
  fs.writeFileSync(paths["input-manifest.json"], `${JSON.stringify({call_id: id, files: inputManifest.sort((a, b) => a.path.localeCompare(b.path))}, null, 2)}\n`);
  const startMonotonic = process.hrtime.bigint();
  const startWall = new Date().toISOString();
  let result;
  let streamBuffer = "";
  const observedSpawnIds = new Set();
  const failureMonitor = createCodexJsonlFailureMonitor({source: `${id} Codex JSONL`});
  const codexArgs = ["exec", "--ephemeral", "--json", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "-m", MODEL, "-c", `model_reasoning_effort=\"${EFFORT}\"`, ...ambientReviewSquadDisableArgs(), "-s", "read-only", "-C", scratchRoot, "--output-schema", paths["output.schema.json"], "-o", paths["final.json"], "-"];
  fs.writeFileSync(paths["effective-argv.json"], `${JSON.stringify(["codex", ...codexArgs], null, 2)}\n`);
  try {
    result = await runBoundedProcess("codex", codexArgs, {
      cwd: scratchRoot, timeoutMs: CALL_TIMEOUT_MS, signal: abortController.signal, stdin: prompt,
      onStdout(chunk) {
        failureMonitor(chunk);
        if (!expectedDelegation) return;
        streamBuffer += chunk;
        const lines = streamBuffer.split(/\r?\n/);
        streamBuffer = lines.pop();
        for (const line of lines.filter((item) => item.trim())) {
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          for (const observed of delegationEvents([event])) {
            if (observed.call_id) observedSpawnIds.add(observed.call_id);
          }
          if (observedSpawnIds.size > expectedDelegation.maximum) throw new Error(`authorized delegation ceiling exceeded: ${observedSpawnIds.size} > ${expectedDelegation.maximum}`);
        }
      }
    });
    fs.rmSync(scratchRoot, {recursive: true, force: true});
  } catch (error) {
    const confirmed = error.result?.shutdown?.exit_confirmed !== false;
    if (confirmed) fs.rmSync(scratchRoot, {recursive: true, force: true});
    fs.writeFileSync(paths["events.jsonl"], error.result?.stdout ?? "");
    fs.writeFileSync(paths["stderr.txt"], error.result?.stderr ?? error.message);
    const evidence = {id, phase, subject, status: "failed", diagnostic: error.result?.diagnostic ?? {kind: "process_failure"}, shutdown: error.result?.shutdown ?? null, scratch_root: confirmed ? "removed" : scratchRoot, partial_stdout_bytes: Buffer.byteLength(error.result?.stdout ?? ""), partial_stderr_bytes: Buffer.byteLength(error.result?.stderr ?? "")};
    fs.writeFileSync(paths["call.json"], `${JSON.stringify(evidence, null, 2)}\n`);
    throw Object.assign(error, {evidence});
  }
  const endMonotonic = process.hrtime.bigint();
  fs.writeFileSync(paths["events.jsonl"], result.stdout);
  fs.writeFileSync(paths["stderr.txt"], result.stderr);
  let events;
  let final;
  try {
    events = parseJsonl(result.stdout, {source: `${id} Codex JSONL`});
    final = JSON.parse(fs.readFileSync(paths["final.json"], "utf8"));
  } catch (error) {
    const evidence = {id, phase, subject, status: "failed", diagnostic: error.diagnostic ?? {kind: "invalid_final_response", message: error.message}, process_exit_confirmed: true, partial_stdout_bytes: Buffer.byteLength(result.stdout), partial_stderr_bytes: Buffer.byteLength(result.stderr)};
    fs.writeFileSync(paths["call.json"], `${JSON.stringify(evidence, null, 2)}\n`);
    throw Object.assign(error, {evidence});
  }
  let delegations;
  let delegationMapping = null;
  try {
    delegations = delegationEvents(events);
    fs.writeFileSync(paths["delegation-events.json"], `${JSON.stringify(delegations, null, 2)}\n`);
    if (expectedDelegation) {
      delegationMapping = assessDelegationObservation({delegations, laneResults: final.lane_results, ...expectedDelegation, allowUnobservable: allowUnobservableDelegation});
      delegationMapping.raw_artifact = paths["delegation-events.json"];
      delegationMapping.raw_artifact_sha256 = hash(fs.readFileSync(paths["delegation-events.json"]));
    }
  } catch (error) {
    const evidence = {id, phase, subject, status: "failed", diagnostic: {kind: "delegation_or_lane_parse_failure", message: error.message}, process_exit_confirmed: true, partial_stdout_bytes: Buffer.byteLength(result.stdout), partial_stderr_bytes: Buffer.byteLength(result.stderr)};
    fs.writeFileSync(paths["call.json"], `${JSON.stringify(evidence, null, 2)}\n`);
    throw Object.assign(error, {evidence});
  }
  const usage = events.filter(({type}) => type === "turn.completed").at(-1)?.usage ?? null;
  const tokenAccounting = classifyTokenAccounting(events, delegations);
  const completeWorkflowUsage = workflowUsage(usage, tokenAccounting);
  const ambientIsolation = assessAmbientReviewSquadIsolation(final);
  const evidence = {
    id, phase, subject, status: "completed", code: result.code, signal: result.signal,
    prompt: paths["prompt.txt"], prompt_sha256: hash(prompt), schema: paths["output.schema.json"], raw_jsonl: paths["events.jsonl"], raw_jsonl_sha256: hash(result.stdout), untouched_final_response: paths["final.json"],
    start_wall: startWall, end_wall: new Date().toISOString(), start_monotonic_ns: startMonotonic.toString(), end_monotonic_ns: endMonotonic.toString(), duration_ns: (endMonotonic - startMonotonic).toString(),
    requested_model: MODEL, requested_reasoning_effort: EFFORT,
    observed_model: findMetadata(events, ["model"]), observed_reasoning_effort: findMetadata(events, ["reasoning_effort", "model_reasoning_effort"]),
    observed_delegated_calls: delegations.length, authorized_delegation_ceiling: expectedDelegation?.maximum ?? 0,
    delegation_events: paths["delegation-events.json"], delegation_mapping: delegationMapping,
    usage: usageFields(usage), token_accounting: tokenAccounting, workflow_usage: completeWorkflowUsage,
    ambient_review_squad_isolation: ambientIsolation,
    effective_argv: paths["effective-argv.json"], effective_argv_sha256: hash(fs.readFileSync(paths["effective-argv.json"])),
    input_manifest: paths["input-manifest.json"], scratch_root_removed: true, stderr: paths["stderr.txt"]
  };
  fs.writeFileSync(paths["call.json"], `${JSON.stringify(evidence, null, 2)}\n`);
  return {evidence, events, final, delegations, delegationMapping, ambientIsolation};
}

function materializeTarget(outputRoot, subjectId, caseId) {
  const targetRoot = path.join(outputRoot, "targets", subjectId, caseId);
  const item = corpus.cases.find(({id}) => id === caseId);
  for (const [relativePath, content] of Object.entries(item.artifacts)) {
    const target = path.join(targetRoot, relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, content);
  }
  return targetRoot;
}

function stats(values) {
  if (!values.length) return {status: "not_verified", sample_size: 0};
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : null;
  return {status: "observed", sample_size: values.length, mean, median: sorted[Math.floor(sorted.length / 2)], sample_variance: variance, min: sorted[0], max: sorted.at(-1)};
}

function productionCostMetrics(calls) {
  return Object.fromEntries(["v0.2.3", "v0.3.0"].map((subject) => {
    const selected = calls.filter((call) => call.phase === "production_behavior" && call.subject === subject);
    const tokenFields = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];
    const accountingVerified = selected.every(({workflow_usage}) => workflow_usage?.status === "observed");
    return [subject, {
      sample_size: selected.length,
      wall_seconds: stats(selected.map(({duration_ns}) => Number(duration_ns) / 1e9)),
      token_comparison_status: accountingVerified ? "verified_complete_workflow_usage" : "not_verified",
      token_comparison_reason: accountingVerified ? null : "turn.completed.usage was not proven to include every delegated lane; primary-only usage is not compared as workflow total",
      tokens: accountingVerified ? Object.fromEntries(tokenFields.map((field) => [field, stats(selected.map(({workflow_usage}) => workflow_usage[field]).filter(Number.isFinite))])) : null,
      pricing: {status: "not_verified", reason: "runner does not infer prices"}
    }];
  }));
}

async function shutdownProbe(outputRoot) {
  try {
    await runBoundedProcess(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); process.stdout.write('probe-started\\n'); setInterval(()=>{},1000)"], {cwd: outputRoot, timeoutMs: 40, shutdown: {gracefulMs: 20, termMs: 20, killMs: 2_000}});
    throw new Error("shutdown probe unexpectedly exited normally");
  } catch (error) {
    const probe = {expected_timeout: true, diagnostic: error.result?.diagnostic ?? null, stdout: error.result?.stdout ?? "", stderr: error.result?.stderr ?? "", shutdown: error.result?.shutdown ?? null};
    assert.equal(probe.diagnostic?.kind, "timeout");
    assert.equal(probe.shutdown?.sigterm_sent, true);
    assert.equal(probe.shutdown?.sigkill_sent, true);
    assert.equal(probe.shutdown?.exit_confirmed, true);
    fs.writeFileSync(path.join(outputRoot, "shutdown-probe.json"), `${JSON.stringify(probe, null, 2)}\n`);
    return probe;
  }
}

const currentProtocolFingerprint = protocolFingerprint();
const validatedPilotPrerequisite = parsed.authorized ? validatePilotPrerequisite(parsed.pilotEvidence, currentProtocolFingerprint) : null;
fs.mkdirSync(parsed.output, {recursive: false});
const subjectRoot = path.join(parsed.output, "subjects");
const rawRoot = path.join(parsed.output, "raw");
fs.mkdirSync(subjectRoot);
fs.mkdirSync(rawRoot);
const runEvidence = {schema_version: "2.0", mode: parsed.pilot ? "pilot" : "full", status: "running", release_evidence: false, plan: parsed.pilot ? pilotPlan : fullPlan, protocol_fingerprint: currentProtocolFingerprint, validated_pilot_prerequisite: validatedPilotPrerequisite, self_verification: null, calls: [], raw_seal: null, scoring: null, production_cost_metrics: null};

try {
  runEvidence.self_verification = verifyProtocol(subjectRoot);
  fs.writeFileSync(path.join(parsed.output, "self-verification.json"), `${JSON.stringify(runEvidence.self_verification, null, 2)}\n`);

  const reviewOutputs = [];
  if (parsed.pilot) {
    runEvidence.shutdown_probe = await shutdownProbe(parsed.output);
    const subject = "v0.3.0";
    const caseId = "backend-seeded";
    const targetRoot = materializeTarget(parsed.output, subject, caseId);
    const prompt = `${wrappers.pilot}\n\nEvaluation subject: ${subject}\nTarget case: ${caseId}\n${subjectBlock(subject, subjectRoot)}`;
    const call = await runCodex({id: `pilot-${subject}-${caseId}`, phase: "production_behavior", subject, targetSource: targetRoot, prompt, schema: productionSchema(subject, caseId, {minimum_lanes: 3, maximum_lanes: 3}), rawRoot, expectedDelegation: {minimum: 3, maximum: 3}, allowUnobservableDelegation: true});
    runEvidence.calls.push(call.evidence);
    const verdict = pilotCompatibilityVerdict({events: call.events, delegations: call.delegations, delegationMapping: call.delegationMapping, ambientIsolation: call.ambientIsolation, laneResults: call.final.lane_results, usageStatus: call.evidence.usage.status, expectedDelegations: PILOT_DELEGATED_CALLS});
    runEvidence.pilot_checks = {...verdict.checks, token_accounting_classification: call.evidence.token_accounting, timeout_shutdown: "verified", oracle_opened: false, scoring_run: false};
    runEvidence.status = verdict.status;
  } else {
    for (const subject of Object.keys(subjects.subjects)) {
      const block = subjectBlock(subject, subjectRoot);
      for (const [reviewer, caseIds] of Object.entries(allocation.reviewers)) {
        const id = `controlled-${subject}-${reviewer}`;
        const prompt = `${wrappers.controlled_quality}\n\nEvaluation subject: ${subject}\n${block}\n${caseBlock(caseIds)}`;
        const call = await runCodex({id, phase: "controlled_quality", subject, prompt, schema: controlledSchema(subject, caseIds), rawRoot});
        assert.equal(call.ambientIsolation.status, "verified", `${id} ambient Review Squad isolation is not verified`);
        validateControlledCaseCoverage(call.final, caseIds);
        runEvidence.calls.push(call.evidence);
        reviewOutputs.push({phase: "controlled_quality", call_id: id, subject, allocated_case_ids: [...caseIds], final: call.final});
      }
      for (const caseId of ["web-seeded", "backend-seeded", "infrastructure-seeded"]) {
        const id = `production-${subject}-${caseId}`;
        const targetRoot = materializeTarget(parsed.output, subject, caseId);
        const contract = PRODUCTION_CONTRACTS[subject];
        const prompt = `${wrappers.production_behavior}\n\nEvaluation subject: ${subject}\nShipped production contract: ${JSON.stringify(contract)}\nTarget case: ${caseId}\n${block}`;
        const call = await runCodex({id, phase: "production_behavior", subject, targetSource: targetRoot, prompt, schema: productionSchema(subject, caseId, contract), rawRoot, expectedDelegation: {minimum: contract.minimum_lanes, maximum: contract.maximum_lanes}});
        assert.equal(call.ambientIsolation.status, "verified", `${id} ambient Review Squad isolation is not verified`);
        runEvidence.calls.push(call.evidence);
        reviewOutputs.push({phase: "production_behavior", call_id: id, subject, delegation_mapping: call.delegationMapping, final: call.final});
      }
    }

    const rawSeal = {sealed_at: new Date().toISOString(), files: {}};
    for (const call of runEvidence.calls) {
      rawSeal.files[path.relative(parsed.output, call.raw_jsonl)] = call.raw_jsonl_sha256;
      rawSeal.files[path.relative(parsed.output, call.untouched_final_response)] = hash(fs.readFileSync(call.untouched_final_response));
    }
    const rawSealPath = path.join(parsed.output, "raw-seal.json");
    fs.writeFileSync(rawSealPath, `${JSON.stringify(rawSeal, null, 2)}\n`);
    runEvidence.raw_seal = {path: rawSealPath, sha256: hash(fs.readFileSync(rawSealPath))};

    const findings = flattenReviewFindings(reviewOutputs);
    const expectations = readJson(path.join(evalRoot, "expectations.json"));
    const scoringInput = {raw_seal_sha256: runEvidence.raw_seal.sha256, expectations, findings};
    const scorerRuns = [];
    for (const scorer of ["scorer-a", "scorer-b"]) {
      const prompt = `${wrappers.independent_scoring}\n\nScorer identity: ${scorer}\n\n${JSON.stringify(scoringInput, null, 2)}`;
      const call = await runCodex({id: scorer, phase: "independent_scoring", subject: null, prompt, schema: scorerSchema(), rawRoot});
      assert.equal(call.ambientIsolation.status, "verified", `${scorer} ambient Review Squad isolation is not verified`);
      assert.equal(call.final.scorer, scorer, `${scorer} returned the wrong scorer identity`);
      runEvidence.calls.push(call.evidence);
      scorerRuns.push({scorer, final: call.final, evidence: call.evidence});
    }
    const validated = [];
    const invalid = [];
    for (const scorer of scorerRuns) {
      try {
        validated.push({scorer: scorer.scorer, ledger: validateScoringLedger({findings, ledger: scorer.final.ledger, expectations})});
      } catch (error) {
        invalid.push({scorer: scorer.scorer, message: error.message});
      }
    }
    if (invalid.length) {
      runEvidence.scoring = {status: "not_verified_invalid_ledger", invalid, canonical_metrics: null};
      runEvidence.status = "completed_not_verified";
    } else {
      const comparison = compareScoringLedgers(validated[0].ledger, validated[1].ledger);
      if (comparison.agreed) {
        const canonicalMetrics = computeDeterministicMetrics({findings, ledger: validated[0].ledger, expectations, reviewOutputs});
        const duplicateMetrics = Object.fromEntries(["v0.2.3", "v0.3.0"].map((subject) => [subject, canonicalMetrics.production_behavior[subject]]));
        const duplicatesVerified = Object.values(duplicateMetrics).every(({duplicate_metric_status}) => duplicate_metric_status === "observed");
        runEvidence.scoring = {status: "agreed", disagreements: [], canonical_ledger: validated[0].ledger, canonical_metrics: canonicalMetrics, production_duplicate_comparison: duplicatesVerified ? {status: "observed", subjects: duplicateMetrics} : {status: "not_verified", reason: "one or more delegated lanes lacked a completed raw lane result", subjects: duplicateMetrics}, arithmetic_source: "deterministic runner"};
        runEvidence.status = "completed_scoring_agreed_gates_still_not_self_certified";
      } else {
        runEvidence.scoring = {status: "not_verified_scorer_disagreement", disagreements: comparison.disagreements, canonical_metrics: null, adjudication_plan: {scope: "only listed identity disagreements", maximum_additional_primary_calls: 1, delegated_calls: 0, authorization: "separate later authorization required", rule: "adjudicator chooses a case-allowed root/evidence/severity mapping; no averaging or scorer selection"}};
        runEvidence.status = "completed_not_verified";
      }
    }
    runEvidence.production_cost_metrics = productionCostMetrics(runEvidence.calls);
  }
} catch (error) {
  runEvidence.status = "failed";
  runEvidence.failure = {name: error.name, message: error.message, diagnostic: error.diagnostic ?? null, call: error.evidence ?? null};
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(parsed.output, "result.json"), `${JSON.stringify(runEvidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(runEvidence, null, 2)}\n`);
}
