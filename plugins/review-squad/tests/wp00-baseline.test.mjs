import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(testsRoot, "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(testsRoot, relative), "utf8"));

const baseline = readJson("baseline/v0.2.3.json");
const contract = readJson("fixtures/baseline-contract.json");
const legacySchemaPath = fs.existsSync(path.join(pluginRoot, "references", "schemas", "review-report.v1.1.schema.json"))
  ? path.join(pluginRoot, "references", "schemas", "review-report.v1.1.schema.json")
  : path.join(pluginRoot, "references", "review-report.schema.json");
const schema = JSON.parse(fs.readFileSync(legacySchemaPath, "utf8"));

test("v0.2.3 release baseline is recorded", () => {
  assert.equal(baseline.release, "0.2.3");
  assert.match(baseline.tag_commit, /^[0-9a-f]{40}$/);
  assert.equal(baseline.results.plugin_validation_passed, true);
  assert(baseline.results.skill_and_reference_words > 0);
});

test("baseline report fixture is internally complete", () => {
  const report = readJson("fixtures/reports/v1.1/valid-empty.json");
  assert.equal(report.schema_version, "1.1");
  assert.equal(report.mode_data.type, report.mode);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.not_verified, []);
});

test("all later report weaknesses have characterization cases", () => {
  const ids = new Set(contract.report_cases.map(({ id }) => id));
  for (const required of ["valid-empty", "empty-evidence", "mismatched-counts", "invalid-mode", "invalid-severity", "malformed-bmad"]) {
    assert(ids.has(required), `missing report case ${required}`);
  }
});

test("v0.2.3 schema weakness remains pinned in the legacy schema", () => {
  assert.equal(schema.properties.schema_version.const, "1.1");
  assert.equal(schema.$defs.finding.properties.evidence.minItems, undefined);
  assert.equal(schema.$defs.finding.properties.source.minItems, undefined);
  assert(schema.$defs.finding.required.includes("bmad"));
  assert(schema.required.includes("decision_summary"));
});

test("all later-work contract matrices are non-empty", () => {
  for (const key of ["routing_cases", "approval_cases", "project_signal_cases", "glob_cases", "bmad_cases", "browser_degradation_cases", "browser_isolation_cases", "mutation_boundary_cases", "artifact_root_cases", "severity_cases", "installation_recovery_cases", "dispatch_runtime_cases"]) {
    assert(contract[key].length > 0, `${key} must not be empty`);
    assert.equal(new Set(contract[key].map(({ id }) => id)).size, contract[key].length, `${key} IDs must be unique`);
  }
});

test("fixture definitions cover all approved project types", () => {
  const labels = new Set(contract.project_signal_cases.flatMap(({ expected_labels }) => expected_labels));
  for (const required of ["web", "backend_api", "mobile", "cli", "data_pipeline", "agent_plugin_prompt", "library_sdk", "infrastructure_iac", "ci_tooling"]) {
    assert(labels.has(required), `missing project type ${required}`);
  }
});

test("external-write boundary characterizes every high-risk action", () => {
  const stopped = new Set(contract.mutation_boundary_cases.filter(({ expected }) => expected === "stop").map(({ action }) => action));
  for (const required of ["final_signup_submit", "place_order", "send_message", "confirm_subscription", "upload_file"]) {
    assert(stopped.has(required), `missing stop boundary for ${required}`);
  }
});

test("every audit item has a deterministic fixture surface", () => {
  const coverage = {
    "I-01": "dispatch_runtime_cases",
    "I-02": "report_cases",
    "I-03": "report_cases",
    "I-04": "dispatch_runtime_cases",
    "I-05": "project_signal_cases",
    "I-06": "browser_isolation_cases",
    "I-07": "mutation_boundary_cases",
    "I-08": "browser_degradation_cases",
    "M-01": "severity_cases",
    "M-02": "dispatch_runtime_cases",
    "M-03": "artifact_root_cases",
    "M-04": "installation_recovery_cases",
    "D-01": "browser_degradation_cases",
    "D-02": "report_cases"
  };
  for (const [finding, fixtureKey] of Object.entries(coverage)) {
    assert(contract[fixtureKey]?.length > 0, `${finding} has no ${fixtureKey} fixture`);
  }
});
