#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

if (process.argv.length === 3 && process.argv[2] === "--help") {
  console.log("Usage: node check-eval-corpus.mjs");
  process.exit(0);
}
if (process.argv.length !== 2) {
  console.error("Usage: node check-eval-corpus.mjs");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const evalRoot = path.join(here, "..", "tests", "eval");
const corpus = JSON.parse(fs.readFileSync(path.join(evalRoot, "corpus.json"), "utf8"));
const expectations = JSON.parse(fs.readFileSync(path.join(evalRoot, "expectations.json"), "utf8"));
const allocation = JSON.parse(fs.readFileSync(path.join(evalRoot, "allocation-v1.json"), "utf8"));
const reproducibility = JSON.parse(fs.readFileSync(path.join(evalRoot, "reproducibility.json"), "utf8"));
const subjects = JSON.parse(fs.readFileSync(path.join(evalRoot, "subjects-v1.json"), "utf8"));
const repoRoot = path.resolve(evalRoot, "..", "..", "..", "..");

assert.equal(corpus.schema_version, "1.0");
assert.equal(expectations.schema_version, "1.0");
assert.equal(reproducibility.schema_version, "3.0");

const ids = corpus.cases.map(({ id }) => id);
assert.equal(new Set(ids).size, ids.length, "eval case IDs must be unique");
assert.deepEqual(Object.keys(expectations.cases).sort(), [...ids].sort(), "expectations must cover every case exactly once");

const surfaces = new Set(corpus.cases.map(({ surface }) => surface));
for (const required of ["agent_plugin_prompt", "web", "backend_api", "library_sdk", "infrastructure_iac"]) {
  assert(surfaces.has(required), `eval corpus is missing ${required}`);
}

const severities = new Set(Object.values(expectations.cases).flatMap(({ expected_findings }) => expected_findings.map(({ severity }) => severity)));
for (const required of ["critical", "important", "minor"]) {
  assert(severities.has(required), `eval corpus is missing a seeded ${required} finding`);
}

const cleanControls = Object.values(expectations.cases).filter(({ expected_findings }) => expected_findings.length === 0);
assert(cleanControls.length >= 2, "eval corpus must contain multiple clean controls");

for (const item of corpus.cases) {
  assert(Object.keys(item.artifacts).length > 0, `${item.id} must contain raw project artifacts`);
  const serialized = JSON.stringify(item);
  for (const expected of expectations.cases[item.id].expected_findings) {
    assert(!serialized.includes(expected.id), `${item.id} leaks expected finding ${expected.id}`);
  }
}

const allocated = Object.values(allocation.reviewers).flat();
assert.deepEqual([...allocated].sort(), [...ids].sort(), "allocation must cover every case exactly once");
assert.equal(new Set(allocated).size, ids.length, "allocation must not repeat cases");
for (const [reviewer, reviewerCases] of Object.entries(allocation.reviewers)) {
  const reviewerSurfaces = reviewerCases.map((id) => corpus.cases.find((item) => item.id === id).surface);
  assert.equal(new Set(reviewerSurfaces).size, reviewerSurfaces.length, `${reviewer} receives a clean/seeded surface pair`);
}

for (const {file, sha256} of Object.values(reproducibility.future_protocol.wrappers)) {
  const prompt = fs.readFileSync(path.join(evalRoot, file));
  assert.equal(crypto.createHash("sha256").update(prompt).digest("hex"), sha256, `${file} hash mismatch`);
}
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(evalRoot, reproducibility.future_protocol.subject_manifest.file))).digest("hex"), reproducibility.future_protocol.subject_manifest.sha256, "subject manifest hash mismatch");
for (const key of ["corpus", "allocation"]) {
  const {file, sha256} = reproducibility.future_protocol[key];
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(evalRoot, file))).digest("hex"), sha256, `${file} hash mismatch`);
}
assert.equal(subjects.evaluation_skill, "review-squad:experts");
assert.equal(subjects.subjects["v0.2.3"].source.required_manifest_name, "review-squad");
assert.equal(subjects.subjects["v0.2.3"].source.required_manifest_version, "0.2.3");
assert.equal(subjects.subjects["v0.3.0"].source.required_manifest_name, "review-squad");
assert.equal(subjects.subjects["v0.3.0"].source.required_manifest_version, "0.3.0");
for (const [subjectId, subject] of Object.entries(subjects.subjects)) {
  assert(Object.keys(subject.files).length >= 5, `${subjectId} has no complete model-visible subject bundle`);
  assert(subject.files["plugins/review-squad/skills/experts/SKILL.md"], `${subjectId} is missing experts/SKILL.md`);
  for (const [relativePath, expectedHash] of Object.entries(subject.files)) {
    assert.match(expectedHash, /^[a-f0-9]{64}$/, `${subjectId} invalid subject hash: ${relativePath}`);
    if (subject.source.kind === "worktree") {
      const content = fs.readFileSync(path.join(repoRoot, relativePath));
      assert.equal(crypto.createHash("sha256").update(content).digest("hex"), expectedHash, `${subjectId} subject hash mismatch: ${relativePath}`);
    }
  }
}
assert.equal(reproducibility.future_protocol.baseline_commit, "f4ca1b80a9f165feb0d94dbcb2a2f45a279b2b25");
assert.deepEqual(reproducibility.future_protocol.production_contracts["v0.2.3"], {
  minimum_lanes: 4,
  maximum_lanes: 8,
  dispatch: "shipped default panel of 4-8 reviewers",
  tier_policy: "shipped v0.2.3 effort policy; medium by default and high/low only where its instructions require"
});
assert.deepEqual(reproducibility.future_protocol.production_contracts["v0.3.0"], {
  minimum_lanes: 3,
  maximum_lanes: 5,
  dispatch: "three evidence-selected initial lanes with evidence-based escalation capped at five",
  tier_policy: "shipped v0.3.0 Sol/high, Terra/medium, and Terra/low lane policy"
});
assert.equal(reproducibility.future_protocol.run_matrix.total_primary_calls, 12);
assert.equal(reproducibility.future_protocol.run_matrix.production_behavior_maximum_total_calls, 45);
assert.equal(reproducibility.future_protocol.run_matrix.maximum_total_delegated_calls, 39);
assert.equal(reproducibility.future_protocol.run_matrix.configured_top_level_maximum_calls, 51);
assert.equal(reproducibility.future_protocol.run_matrix.runtime_proven_global_maximum_calls, null);
assert.equal(reproducibility.future_protocol.pilot.configured_top_level_primary_calls, 1);
assert.equal(reproducibility.future_protocol.pilot.configured_top_level_delegated_calls, 3);
assert.equal(reproducibility.future_protocol.pilot.configured_top_level_maximum_calls, 4);
assert.equal(reproducibility.future_protocol.pilot.runtime_proven_global_maximum_calls, null);
assert.equal(reproducibility.future_protocol.pilot.oracle_opened, false);
for (const run of Object.values(reproducibility.historical_runs)) {
  assert.equal(run.status, "not_reproducible");
  assert(run.missing.length > 0);
}
for (const file of ["v0.2.3.json", "v0.3.0-wp02.json", "multi-lane-duplicate-comparison.json"]) {
  const result = JSON.parse(fs.readFileSync(path.join(evalRoot, "results", file), "utf8"));
  assert.equal(result.reproducibility_status, "not_reproducible", file);
}

console.log(`Eval corpus and protocol metadata valid: ${ids.length} blinded cases across ${surfaces.size} surfaces. No model evaluation was run.`);
