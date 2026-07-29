import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {bmadExtensionFromDetection, detectBmad} from "../scripts/lib/detection.mjs";
import {migrateReport} from "../scripts/migrate-report.mjs";
import {renderReport} from "../scripts/render-report.mjs";
import {validateLegacyReport, validateReport} from "../scripts/lib/report-validation.mjs";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(testsRoot, relative), "utf8"));
const clone = (value) => structuredClone(value);
const v2Names = ["experts-decision-bmad", "normies-not-verified-inline", "normies-partial-panel", "regulars-clean", "well-actually-finding"];

test("all schema 2.0 mode fixtures validate", () => {
  for (const name of v2Names) {
    const result = validateReport(readJson(`fixtures/reports/v2/${name}.json`));
    assert.equal(result.valid, true, `${name}: ${JSON.stringify(result.diagnostics)}`);
  }
});

test("partial normies panels retain completed evidence and identify undispatched personas", () => {
  const report = readJson("fixtures/reports/v2/normies-partial-panel.json");
  assert.equal(validateReport(report).valid, true);
  assert.equal(report.mode_data.panel_status, "partial");
  assert.deepEqual(report.mode_data.personas.map(({persona}) => persona), ["DECIDE"]);
  assert.deepEqual(report.not_verified.map(({item}) => item), ["VERIFY persona", "ADOPT persona"]);
  assert(report.not_verified.every(({reason}) => reason.includes("no browser leak was detected")));
});

test("verified findings require evidence and source attribution", () => {
  const base = readJson("fixtures/reports/v2/well-actually-finding.json");
  for (const field of ["evidence", "source"]) {
    const report = clone(base);
    report.findings[0][field] = [];
    const result = validateReport(report);
    assert.equal(result.valid, false);
    assert(result.diagnostics.some(({path: itemPath, code}) => itemPath === `/findings/0/${field}` && code === "SCHEMA_MINITEMS"));
  }
});

test("semantic validation rejects mismatched counts and undeclared sources", () => {
  const report = readJson("fixtures/reports/v2/well-actually-finding.json");
  report.summary.minor_count = 0;
  report.findings[0].source = ["UNKNOWN"];
  const result = validateReport(report);
  assert.equal(result.valid, false);
  assert(result.diagnostics.some(({code}) => code === "SUMMARY_COUNT_MISMATCH"));
  assert(result.diagnostics.some(({code}) => code === "UNDECLARED_SOURCE"));
});

test("mode data uses closed task, persona, confusion, and fix-list structures", () => {
  const cases = [
    ["regular task", "regulars-clean", (report) => { delete report.mode_data.scorecard[0].detail; }],
    ["regular task extra field", "regulars-clean", (report) => { report.mode_data.scorecard[0].unexpected = true; }],
    ["normies persona", "normies-not-verified-inline", (report) => { report.mode_data.personas[0] = {persona: "VISITOR"}; }],
    ["normies confusion", "normies-not-verified-inline", (report) => { report.mode_data.confusion_matrix.push({point: "pricing"}); }],
    ["well-actually persona", "well-actually-finding", (report) => { report.mode_data.roast_by_persona[0] = {persona: "Grammarian"}; }],
    ["well-actually fix", "well-actually-finding", (report) => { report.mode_data.practical_fixlist[0] = {action: "Fix it."}; }]
  ];
  for (const [name, fixture, mutate] of cases) {
    const report = readJson(`fixtures/reports/v2/${fixture}.json`);
    mutate(report);
    const result = validateReport(report);
    assert.equal(result.valid, false, `${name} should fail`);
    assert(result.diagnostics.some(({code}) => code === "SCHEMA_REQUIRED" || code === "SCHEMA_ADDITIONALPROPERTIES"), `${name}: ${JSON.stringify(result.diagnostics)}`);
  }
});

test("regular result counts are derived from the scorecard", () => {
  const report = readJson("fixtures/reports/v2/regulars-clean.json");
  report.mode_data.result_counts = {pass: 0, partial: 1, fail: 0};
  const result = validateReport(report);
  assert.equal(result.valid, false);
  assert.deepEqual(result.diagnostics.filter(({code}) => code === "REGULARS_RESULT_COUNT_MISMATCH").map(({path: itemPath}) => itemPath).sort(), [
    "/mode_data/result_counts/partial",
    "/mode_data/result_counts/pass"
  ]);
});

test("mode, artifact, evidence, and extension invariants fail specifically", () => {
  const base = readJson("fixtures/reports/v2/experts-decision-bmad.json");
  const cases = [
    ["mode", (r) => { r.generator.skill = "review-squad:normies"; }, "GENERATOR_MODE_MISMATCH"],
    ["artifact", (r) => { r.artifacts.stem = "other"; }, "ARTIFACT_STEM_MISMATCH"],
    ["artifact-state", (r) => { r.artifacts.status = "inline_only"; }, "SCHEMA_TYPE"],
    ["evidence", (r) => { r.findings[0].evidence[0].path = null; }, "FILE_EVIDENCE_PATH_REQUIRED"],
    ["bmad", (r) => { r.extensions.bmad.schema_version = "9"; }, "BMAD_EXTENSION_CONST"]
  ];
  for (const [name, mutate, expectedCode] of cases) {
    const report = clone(base);
    mutate(report);
    const result = validateReport(report);
    assert.equal(result.valid, false, `${name} should fail`);
    assert(result.diagnostics.some(({code}) => code === expectedCode), `${name} missing ${expectedCode}: ${JSON.stringify(result.diagnostics)}`);
  }
});

test("Markdown rendering is byte-stable against goldens for every mode", () => {
  for (const name of v2Names) {
    const report = readJson(`fixtures/reports/v2/${name}.json`);
    const expected = fs.readFileSync(path.join(testsRoot, `golden/${name}.md`), "utf8");
    assert.equal(renderReport(report), expected, name);
    assert.equal(renderReport(report), renderReport(clone(report)), `${name} must render deterministically`);
  }
});

test("generic reports omit BMAD output entirely", () => {
  for (const name of v2Names.filter((item) => item !== "experts-decision-bmad")) {
    const report = readJson(`fixtures/reports/v2/${name}.json`);
    assert.equal(report.extensions?.bmad, undefined);
    assert(!renderReport(report).includes("## BMAD"));
  }
});

function representativeLegacy() {
  const report = readJson("fixtures/reports/v1.1/valid-empty.json");
  report.report_id = "legacy-decision";
  report.artifacts = {stem: "legacy-decision", json_path: ".review-squad/reports/legacy-decision.json", markdown_path: ".review-squad/reports/legacy-decision.md"};
  report.summary = {...report.summary, overall_status: "needs_attention", important_count: 1};
  report.decision_summary = {
    patchable_now_count: 0,
    decision_required_count: 1,
    blocks_bmad_count: 0,
    recommended_bmad_commands: [{finding_id: "I-01", command: "make story-run-decision STORY=1.2", reason: "Choose compatibility.", recommended_resolution: "continue_same_story"}]
  };
  report.findings = [{
    id: "I-01",
    severity: "important",
    title: "Compatibility choice",
    description: "Two shapes conflict.",
    evidence: [{kind: "file", path: "api.json", line: 1, line_end: 1, url: null, detail: "The shapes differ."}],
    source: ["TEST"],
    suggested_fix: "Choose one shape.",
    impact: {runtime: "Clients disagree.", architecture: "The contract forks.", delivery: "Migration stalls."},
    remediation: "needs_human",
    decision_flags: {adr_required: false, follow_up_story_required: false, scope_decision_required: true},
    human_gate_summary: {why_human: "The owner must choose.", decision_needed: "Choose the canonical shape.", consequence_if_ignored: "Clients diverge.", recommended_resolution: "continue_same_story"},
    workflow: {patchable_now: false, decision_required: true, blocks_bmad: false},
    bmad: {recommended_command: "make story-run-decision STORY=1.2", command_reason: "Choose compatibility."},
    affected_files: ["api.json"]
  }];
  return report;
}

test("legacy 1.1 migrates to valid 2.0 and migration is idempotent", () => {
  const legacy = representativeLegacy();
  assert.equal(validateLegacyReport(legacy).valid, true);
  const migrated = migrateReport(legacy);
  assert.equal(validateReport(migrated).valid, true);
  assert.equal(migrated.schema_version, "2.0");
  assert.equal(migrated.extensions.bmad.schema_version, "1.0");
  assert.deepEqual(migrateReport(migrated), migrated);
  assert(renderReport(migrated).includes("## BMAD"));
});

test("migration fails explicitly when legacy evidence cannot satisfy 2.0", () => {
  const legacy = representativeLegacy();
  legacy.findings[0].evidence = [];
  assert.equal(validateLegacyReport(legacy).valid, true, "1.1 characterizes empty evidence as valid");
  assert.throws(() => migrateReport(legacy), /MIGRATION_OUTPUT_INVALID[\s\S]*SCHEMA_MINITEMS \/findings\/0\/evidence/);
});

test("BMAD detection follows confirmation, precedence, and activation rules", () => {
  const modern = {"_bmad/_config/manifest.yaml": "version: 6\nmodules: [bmm]\n"};
  const legacy = {".bmad-core/install-manifest.yaml": "version: 4\nmodules: [core]\n"};
  assert.equal(detectBmad({}, {requested: true}).state, "absent");
  assert.equal(detectBmad({"_bmad-output/report.md": "x"}, {requested: true}).state, "absent");
  assert.equal(detectBmad(modern, {}).state, "installed_inactive");
  const activeModern = detectBmad(modern, {requested: true});
  assert.equal(activeModern.state, "active");
  assert.equal(activeModern.selected.kind, "modern");
  assert.equal(bmadExtensionFromDetection(activeModern).schema_version, "1.0");
  assert.equal(detectBmad(legacy, {story: "1.2"}).selected.kind, "legacy");
  const dual = detectBmad({...legacy, ...modern}, {requested: true});
  assert.equal(dual.selected.kind, "modern");
  assert(dual.diagnostics.some((item) => item.includes("legacy")));
  const malformedFallback = detectBmad({...legacy, "_bmad/_config/manifest.yaml": "not: [valid"}, {requested: true});
  assert.equal(malformedFallback.selected.kind, "legacy");
  assert(malformedFallback.diagnostics.some((item) => item.includes("not confirmed")));
});

test("all skills use the shared report workflow with less duplicated prose", () => {
  const baseline = readJson("baseline/v0.2.3.json").results.skill_words;
  for (const [skill, previousWords] of Object.entries(baseline)) {
    const text = fs.readFileSync(path.join(testsRoot, "..", "skills", skill, "SKILL.md"), "utf8");
    const words = text.trim().split(/\s+/).length;
    assert(text.includes("../../references/report-formats.md"), `${skill} must load the shared workflow`);
    assert(!text.includes('schema_version: "1.1"'), `${skill} must not author legacy reports`);
    assert(!text.includes("paired Markdown and JSON"), `${skill} duplicates the old dual-author contract`);
    assert(words < previousWords || skill === "review-squad", `${skill} did not get shorter (${words} >= ${previousWords})`);
  }
});

test("shared report workflow exposes prompt-scoped storage controls without duplicate chat output", () => {
  const reference = fs.readFileSync(path.join(testsRoot, "..", "references", "report-formats.md"), "utf8");
  for (const expected of [
    "Report artifacts: inline_only",
    "Report artifacts: written",
    "Report artifact directory: /absolute/approved/path",
    "always wins",
    "SHA-256 hashes",
    "Do not repeat either full report in chat",
    "unique OS-temporary scratch directory",
    "not deleted automatically"
  ]) assert(reference.includes(expected), `report workflow missing ${expected}`);
  assert(reference.indexOf("explicit `inline_only`") < reference.indexOf("explicitly approved absolute report directory"));
  assert.match(reference, /Do not treat approval of report output as\s+approval for browser artifacts/);
});
