import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = path.dirname(fileURLToPath(import.meta.url));
const referencesRoot = path.resolve(here, "..", "..", "references");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(referencesRoot, relative), "utf8"));

const reportSchema = readJson("review-report.schema.json");
const bmadSchema = readJson("extensions/bmad/review-report-bmad.v1.schema.json");
const legacySchema = readJson("schemas/review-report.v1.1.schema.json");

function buildAjv(options = {}) {
  const ajv = new Ajv2020({allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, ...options});
  addFormats(ajv);
  return ajv;
}

const reportValidator = buildAjv().compile(reportSchema);
const bmadValidator = buildAjv().compile(bmadSchema);
const legacyValidator = buildAjv({strict: false}).compile(legacySchema);

function schemaDiagnostics(errors = [], prefix = "SCHEMA") {
  return errors.map((error) => ({
    code: `${prefix}_${error.keyword.toUpperCase()}`,
    path: error.instancePath || "/",
    message: error.message ?? "schema validation failed"
  }));
}

function add(diagnostics, code, pathName, message) {
  diagnostics.push({code, path: pathName, message});
}

export function validateLegacyReport(report) {
  const valid = legacyValidator(report);
  return {valid, diagnostics: valid ? [] : schemaDiagnostics(legacyValidator.errors, "LEGACY_SCHEMA")};
}

export function validateReport(report) {
  const diagnostics = [];
  if (!reportValidator(report)) {
    diagnostics.push(...schemaDiagnostics(reportValidator.errors));
    return {valid: false, diagnostics};
  }

  const expectedSkill = `review-squad:${report.mode}`;
  if (report.generator.skill !== expectedSkill) {
    add(diagnostics, "GENERATOR_MODE_MISMATCH", "/generator/skill", `expected ${expectedSkill} for mode ${report.mode}`);
  }
  if (report.mode_data.type !== report.mode) {
    add(diagnostics, "MODE_DATA_MISMATCH", "/mode_data/type", `expected ${report.mode}`);
  }

  const derived = {critical: 0, important: 0, minor: 0};
  const findingIds = new Set();
  for (const [index, finding] of report.findings.entries()) {
    derived[finding.severity] += 1;
    if (findingIds.has(finding.id)) add(diagnostics, "DUPLICATE_FINDING_ID", `/findings/${index}/id`, `duplicate finding ID ${finding.id}`);
    findingIds.add(finding.id);
    for (const [evidenceIndex, evidence] of finding.evidence.entries()) {
      if (evidence.kind === "file" && !evidence.path) {
        add(diagnostics, "FILE_EVIDENCE_PATH_REQUIRED", `/findings/${index}/evidence/${evidenceIndex}/path`, "file evidence requires a path");
      }
      if (evidence.kind === "url" && !evidence.url) {
        add(diagnostics, "URL_EVIDENCE_URL_REQUIRED", `/findings/${index}/evidence/${evidenceIndex}/url`, "URL evidence requires a URL");
      }
      if (evidence.line != null && evidence.line_end != null && evidence.line_end < evidence.line) {
        add(diagnostics, "EVIDENCE_LINE_RANGE", `/findings/${index}/evidence/${evidenceIndex}/line_end`, "line_end must be greater than or equal to line");
      }
    }
  }

  for (const severity of ["critical", "important", "minor"]) {
    const field = `${severity}_count`;
    if (report.summary[field] !== derived[severity]) {
      add(diagnostics, "SUMMARY_COUNT_MISMATCH", `/summary/${field}`, `expected ${derived[severity]}, got ${report.summary[field]}`);
    }
  }
  if (report.summary.not_verified_count !== report.not_verified.length) {
    add(diagnostics, "SUMMARY_COUNT_MISMATCH", "/summary/not_verified_count", `expected ${report.not_verified.length}, got ${report.summary.not_verified_count}`);
  }

  if (report.mode === "regulars") {
    const resultCounts = {pass: 0, partial: 0, fail: 0};
    for (const item of report.mode_data.scorecard) resultCounts[item.result] += 1;
    for (const result of Object.keys(resultCounts)) {
      if (report.mode_data.result_counts[result] !== resultCounts[result]) {
        add(diagnostics, "REGULARS_RESULT_COUNT_MISMATCH", `/mode_data/result_counts/${result}`, `expected ${resultCounts[result]}, got ${report.mode_data.result_counts[result]}`);
      }
    }
  }

  const sourceNames = report.sources.map(({name}) => name);
  const declaredSources = new Set(sourceNames);
  if (declaredSources.size !== sourceNames.length) {
    add(diagnostics, "DUPLICATE_SOURCE_NAME", "/sources", "source names must be unique");
  }
  for (const [index, item] of [...report.findings, ...report.not_verified].entries()) {
    for (const source of item.source) {
      if (!declaredSources.has(source)) add(diagnostics, "UNDECLARED_SOURCE", `/${index < report.findings.length ? "findings" : "not_verified"}/${index < report.findings.length ? index : index - report.findings.length}/source`, `source ${source} is not declared`);
    }
  }

  if (report.artifacts.stem !== report.report_id) {
    add(diagnostics, "ARTIFACT_STEM_MISMATCH", "/artifacts/stem", "artifact stem must equal report_id");
  }
  if (report.artifacts.status === "written") {
    if (!report.artifacts.json_path.endsWith(`${report.artifacts.stem}.json`)) add(diagnostics, "ARTIFACT_JSON_PATH", "/artifacts/json_path", "JSON path must end with <stem>.json");
    if (!report.artifacts.markdown_path.endsWith(`${report.artifacts.stem}.md`)) add(diagnostics, "ARTIFACT_MARKDOWN_PATH", "/artifacts/markdown_path", "Markdown path must end with <stem>.md");
  }

  if (report.extensions?.bmad && !bmadValidator(report.extensions.bmad)) {
    diagnostics.push(...schemaDiagnostics(bmadValidator.errors, "BMAD_EXTENSION"));
  }

  return {valid: diagnostics.length === 0, diagnostics};
}

export function formatDiagnostics(diagnostics) {
  return diagnostics.map(({code, path: itemPath, message}) => `${code} ${itemPath}: ${message}`).join("\n");
}
