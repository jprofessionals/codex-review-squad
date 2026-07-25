import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {loadCatalogState, validateCatalogState} from "../scripts/lib/catalog-validation.mjs";
import {buildLaneBriefs, createDossier, planExpertDispatch, reviewCatalog, routeReviewRequest} from "../scripts/lib/dispatch.mjs";
import {detectProjects, matchesGlob} from "../scripts/lib/detection.mjs";
import {PRODUCTION_CONTRACTS} from "../scripts/lib/evaluation-protocol.mjs";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(testsRoot, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");
const contract = JSON.parse(fs.readFileSync(path.join(testsRoot, "fixtures", "baseline-contract.json"), "utf8"));

test("multi-label detector covers every positive and negative fixture", () => {
  for (const fixture of contract.project_signal_cases) {
    const result = detectProjects(fixture.files);
    const labels = result.map(({label}) => label).sort();
    assert.deepEqual(labels, [...fixture.expected_labels].sort(), `${fixture.id}: ${JSON.stringify(result)}`);
    for (const detection of result) {
      assert(detection.confidence > 0 && detection.confidence <= 1);
      assert(detection.evidence.length > 0);
      assert(detection.evidence.every(({file}) => fixture.files.includes(file)));
    }
  }
});

test("double-star globs cover zero, one, and multiple directories without crossing suffixes", () => {
  for (const fixture of contract.glob_cases) {
    for (const file of fixture.matches) assert.equal(matchesGlob(file, fixture.glob), true, `${fixture.id}: ${file}`);
    for (const file of fixture.rejects) assert.equal(matchesGlob(file, fixture.glob), false, `${fixture.id}: ${file}`);
  }
});

test("ordinary audit starts with three evidence-selected lanes and a compact dossier", () => {
  const files = [".codex-plugin/plugin.json", "skills/review/SKILL.md", "scripts/check.mjs"];
  const plan = planExpertDispatch({files, userGoal: "review plugin behavior"});
  assert.equal(plan.initial_lane_count, 3);
  assert.equal(plan.lanes.length, 3);
  assert(plan.lanes.some(({id}) => id === "PROMPT"));
  assert.equal(plan.approval.required, false);
  const dossier = createDossier({files, scope: "plugin", changeContext: "release", testCommands: ["npm test"], exclusions: ["publishing"], riskAssignments: {
    PROMPT: {owned: ["prompt", "tool_contract"], files: ["skills/review/SKILL.md"], exclusions: ["security findings owned by SEC"]},
    TEST: {owned: ["test", "regression"], files: ["scripts/check.mjs"], exclusions: []},
    ARCH: {owned: ["architecture", "compatibility"], files, exclusions: []},
    DX: {owned: ["developer_experience"], files, exclusions: []}
  }});
  assert(Buffer.byteLength(JSON.stringify(dossier)) < 2000);
  assert.equal(dossier.project_labels[0].label, "agent_plugin_prompt");
  const briefs = buildLaneBriefs(plan, dossier);
  assert.equal(briefs.length, 3);
  assert(briefs.every(({responsibility, adjacent_lane_ownership}) => responsibility.length && adjacent_lane_ownership.length));
});

test("high-risk and bounded scans receive the correct model tiers", () => {
  const highRisk = planExpertDispatch({files: ["index.html"], risks: ["security"], explicitHighAssurance: true});
  assert(highRisk.escalation_reasons.includes("high_risk"));
  assert(highRisk.escalation_reasons.includes("explicit_high_assurance"));
  const security = highRisk.lanes.find(({id}) => id === "SEC");
  assert.equal(security.model.requested_model, "gpt-5.6-sol");
  assert.equal(security.model.requested_reasoning_effort, "high");
  assert(highRisk.lanes.length > 3 && highRisk.lanes.length <= 5);

  const bounded = planExpertDispatch({files: ["src/index.ts", "types/index.d.ts"], userGoal: "documentation and developer experience"});
  const dx = bounded.lanes.find(({id}) => id === "DX");
  assert.equal(dx.model.requested_model, "gpt-5.6-terra");
  assert.equal(dx.model.requested_reasoning_effort, "medium");
});

test("routing and approval fixtures reach expected decisions", () => {
  for (const fixture of contract.routing_cases) {
    const actual = routeReviewRequest(fixture.intent);
    const expected = fixture.v2_expected_order ?? [fixture.expected_mode];
    assert.deepEqual(actual, expected, fixture.id);
  }
  for (const fixture of contract.approval_cases) {
    const plan = planExpertDispatch({
      files: ["index.html"],
      requestedLaneCount: fixture.lanes,
      externalAccess: fixture.external_access,
      mutation: fixture.mutation
    });
    const actual = plan.approval.required ? "approval_required" : "auto_approved";
    assert.equal(actual, fixture.expected, fixture.id);
  }
});

test("catalog is consistent and negative mutations fail", () => {
  const state = loadCatalogState(pluginRoot, repoRoot);
  assert.deepEqual(validateCatalogState(state), []);
  const duplicateLane = structuredClone(state);
  duplicateLane.catalog.lanes.push(structuredClone(duplicateLane.catalog.lanes[0]));
  assert(validateCatalogState(duplicateLane).some((error) => error.includes("duplicate IDs")));
  const missingPrompt = structuredClone(state);
  missingPrompt.manifest.interface.defaultPrompt = missingPrompt.manifest.interface.defaultPrompt.filter((prompt) => !prompt.includes("review-squad:normies"));
  assert(validateCatalogState(missingPrompt).some((error) => error.includes("exactly one default prompt for normies")));
  const missingMode = structuredClone(state);
  missingMode.catalog.modes.pop();
  assert(validateCatalogState(missingMode).some((error) => error.includes("catalog modes do not match")));
});

test("production instructions use current dispatch semantics and cold-first routing", () => {
  const experts = fs.readFileSync(path.join(pluginRoot, "skills", "experts", "SKILL.md"), "utf8");
  assert(experts.includes("task_name"));
  assert(experts.includes("message"));
  assert(experts.includes("fork_turns"));
  assert(!experts.includes("fork_context"));
  assert(!experts.includes("agent_type"));
  assert(!experts.includes("4-8"));
  const router = fs.readFileSync(path.join(pluginRoot, "skills", "review-squad", "SKILL.md"), "utf8");
  assert(router.indexOf("`normies`") < router.indexOf("`experts`", router.indexOf("default combined order")));
  const normies = fs.readFileSync(path.join(pluginRoot, "skills", "normies", "SKILL.md"), "utf8");
  for (const required of ["browser_get_config", "browser_close", "panel_status", "partial", "not_verified", "PID/process-tree identity as diagnostic only"]) {
    assert(normies.includes(required), `normies contract missing ${required}`);
  }
});

test("persona and severity guidance is job-based and canonical", () => {
  const panels = fs.readFileSync(path.join(pluginRoot, "references", "panels.md"), "utf8");
  for (const field of ["Domain knowledge", "Device/access", "Goal", "Success"]) assert(panels.includes(field));
  for (const banned of ["Grandparent", "College student", "Retired teacher"]) assert(!panels.includes(banned));
  assert.deepEqual(reviewCatalog.severity.factors, ["goal_blockage", "breadth", "recoverability", "risk_if_ignored", "confidence_and_evidence"]);
  assert.equal(reviewCatalog.severity.unsupported_critical_policy, "reject");
});

test("historical eval claims are not promoted to reproducible release facts", () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(testsRoot, "eval", "results", "v0.2.3.json"), "utf8"));
  const target = JSON.parse(fs.readFileSync(path.join(testsRoot, "eval", "results", "v0.3.0-wp02.json"), "utf8"));
  const duplicates = JSON.parse(fs.readFileSync(path.join(testsRoot, "eval", "results", "multi-lane-duplicate-comparison.json"), "utf8"));
  assert.equal(baseline.reproducibility_status, "not_reproducible");
  assert.equal(target.reproducibility_status, "not_reproducible");
  assert.equal(duplicates.reproducibility_status, "not_reproducible");
  assert.equal(target.comparison.wall_time.status, "not_reproducible");
  assert.equal(duplicates.comparison.status, "not_reproducible");
  assert(target.metrics.expert_skill_bytes < 11719);
});

test("future eval protocol separates controlled quality from shipped production behavior", () => {
  const evalRoot = path.join(testsRoot, "eval");
  const reproducibility = JSON.parse(fs.readFileSync(path.join(evalRoot, "reproducibility.json"), "utf8"));
  const subjects = JSON.parse(fs.readFileSync(path.join(evalRoot, "subjects-v1.json"), "utf8"));
  assert.equal(subjects.subjects["v0.2.3"].source.commit, "f4ca1b80a9f165feb0d94dbcb2a2f45a279b2b25");
  assert.equal(subjects.subjects["v0.3.0"].source.commit, "8ca05939330326830fc6f50a77b3ed062c419c66");
  assert.equal(subjects.subjects["v0.3.0"].source.required_manifest_version, "0.3.0");
  assert(subjects.subjects["v0.3.0"].files["plugins/review-squad/references/review-catalog.json"]);
  assert.equal(reproducibility.future_protocol.run_matrix.total_primary_calls, 12);
  assert.equal(reproducibility.future_protocol.run_matrix.maximum_total_delegated_calls, 39);
  assert.equal(reproducibility.future_protocol.run_matrix.configured_top_level_maximum_calls, 51);
  assert.equal(reproducibility.future_protocol.run_matrix.runtime_proven_global_maximum_calls, null);
  assert.deepEqual(reproducibility.future_protocol.production_contracts, PRODUCTION_CONTRACTS);
  assert.equal(reproducibility.future_protocol.pilot.configured_top_level_primary_calls, 1);
  assert.equal(reproducibility.future_protocol.pilot.configured_top_level_delegated_calls, 3);
  assert.equal(reproducibility.future_protocol.pilot.configured_top_level_maximum_calls, 4);
  assert.equal(reproducibility.future_protocol.pilot.runtime_proven_global_maximum_calls, null);
  assert.equal(reproducibility.future_protocol.pilot.release_evidence, false);
  const runner = fs.readFileSync(path.join(pluginRoot, "scripts", "run-evaluation.mjs"), "utf8");
  for (const required of ["gitShow", "process.hrtime.bigint", "turn.completed", "raw-seal.json", "expectations.json", "scorer-a", "scorer-b", "sample_variance", "lane_results", "--pilot-plan", "production_behavior"]) {
    assert(runner.includes(required), `evaluation runner missing ${required}`);
  }
  assert(runner.indexOf('fs.writeFileSync(rawSealPath') < runner.indexOf('readJson(path.join(evalRoot, "expectations.json"))'));
});
