#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath, pathToFileURL} from "node:url";
import {loadPluginCatalogState, validatePluginCatalogState} from "./lib/catalog-validation.mjs";
import {PLAYWRIGHT_MCP_CONFIG} from "./browser-contract.mjs";

if (process.argv.length === 3 && process.argv[2] === "--help") {
  console.log("Usage: node validate-plugin.mjs");
  process.exit(0);
}
if (process.argv.length !== 2) {
  console.error("Usage: node validate-plugin.mjs");
  process.exit(2);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");

const errors = [];
const missing = new Set();

function rel(file) {
  return path.relative(pluginRoot, file) || ".";
}

function exists(file) {
  return fs.existsSync(file);
}

function requireFile(file) {
  if (!exists(file)) {
    const key = rel(file);
    if (!missing.has(key)) {
      missing.add(key);
      errors.push(`Missing required file: ${key}`);
    }
    return false;
  }
  return true;
}

function readJson(file, label) {
  if (!requireFile(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function readFrontmatter(file) {
  if (!requireFile(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push(`Skill lacks YAML frontmatter: ${rel(file)}`);
    return null;
  }

  const fm = match[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();

  if (!name) errors.push(`Skill frontmatter missing name: ${rel(file)}`);
  if (!description) {
    errors.push(`Skill frontmatter missing description: ${rel(file)}`);
  }

  return { name, description };
}

const requiredFiles = [
  path.join(pluginRoot, ".codex-plugin", "plugin.json"),
  path.join(pluginRoot, ".mcp.json"),
  path.join(pluginRoot, "LICENSE"),
  path.join(pluginRoot, "NOTICE.md"),
  path.join(pluginRoot, "references", "panels.md"),
  path.join(pluginRoot, "references", "dispatch-policy.md"),
  path.join(pluginRoot, "references", "browser-preflight.md"),
  path.join(pluginRoot, "references", "report-formats.md"),
  path.join(pluginRoot, "references", "review-report.schema.json"),
  path.join(pluginRoot, "references", "review-catalog.json"),
  path.join(pluginRoot, "references", "schemas", "review-report.v1.1.schema.json"),
  path.join(pluginRoot, "references", "extensions", "bmad", "review-report-bmad.v1.schema.json"),
  path.join(pluginRoot, "references", "bmad-detection.md"),
  path.join(pluginRoot, "scripts", "validate-report.mjs"),
  path.join(pluginRoot, "scripts", "runtime", "review-runtime.mjs"),
  path.join(pluginRoot, "scripts", "runtime", "runtime-dependencies.json"),
  path.join(pluginRoot, "THIRD_PARTY_NOTICES.md"),
  path.join(pluginRoot, "scripts", "render-report.mjs"),
  path.join(pluginRoot, "scripts", "migrate-report.mjs"),
  path.join(pluginRoot, "scripts", "validate-catalog.mjs"),
  path.join(pluginRoot, "scripts", "validate-plugin.mjs"),
  path.join(pluginRoot, "scripts", "verify-real-browser.mjs"),
  path.join(pluginRoot, "scripts", "verify-installed-plugin.mjs"),
  path.join(pluginRoot, "scripts", "run-evaluation.mjs"),
  path.join(pluginRoot, "scripts", "lib", "process-control.mjs"),
  path.join(pluginRoot, "scripts", "lib", "installed-provenance.mjs"),
  path.join(pluginRoot, "scripts", "lib", "evaluation-protocol.mjs"),
  path.join(pluginRoot, "scripts", "lib", "runtime-dependencies.mjs"),
  path.join(pluginRoot, "tests", "eval", "reproducibility.json"),
  path.join(pluginRoot, "tests", "eval", "reviewer-prompt-v2.md"),
  path.join(pluginRoot, "tests", "eval", "production-review-prompt-v2.md"),
  path.join(pluginRoot, "tests", "eval", "scorer-prompt-v2.md"),
  path.join(pluginRoot, "tests", "eval", "pilot-prompt-v1.md"),
  path.join(pluginRoot, "tests", "fixtures", "reports", "v2", "regulars-clean.json")
];

for (const file of requiredFiles) {
  requireFile(file);
}

const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const manifest = readJson(manifestPath, "plugin manifest");
if (manifest) {
  if (manifest.name !== "review-squad") {
    errors.push(`plugin manifest name must be "review-squad", got "${manifest.name}"`);
  }
  if (manifest.version !== "0.4.0") {
    errors.push(`plugin manifest version must be exactly "0.4.0", got "${manifest.version}"`);
  }
  if (manifest.skills !== "./skills/") {
    errors.push('plugin manifest must reference skills as "./skills/"');
  }
  if (manifest.mcpServers !== "./.mcp.json") {
    errors.push('plugin manifest must reference Playwright MCP as "./.mcp.json"');
  }
}

const mcpConfig = readJson(path.join(pluginRoot, ".mcp.json"), "plugin MCP config");
if (mcpConfig) {
  if (JSON.stringify(mcpConfig.mcpServers?.playwright) !== JSON.stringify(PLAYWRIGHT_MCP_CONFIG)) {
    errors.push("Playwright MCP launcher does not match the pinned browser contract");
  }
}
const runtimeDependencies = readJson(path.join(pluginRoot, "scripts", "runtime", "runtime-dependencies.json"), "runtime dependency manifest");
if (runtimeDependencies) {
  if (runtimeDependencies.schema_version !== "1.0" || runtimeDependencies.generated_from !== "esbuild metafile inputs") {
    errors.push("runtime dependency manifest must be generated from esbuild metafile inputs using schema 1.0");
  }
  const packages = runtimeDependencies.packages;
  if (!Array.isArray(packages) || packages.length === 0) {
    errors.push("runtime dependency manifest must list bundled packages");
  } else {
    const notices = requireFile(path.join(pluginRoot, "THIRD_PARTY_NOTICES.md")) ? fs.readFileSync(path.join(pluginRoot, "THIRD_PARTY_NOTICES.md"), "utf8") : "";
    const expectedLicenseFiles = [];
    const identities = new Set();
    for (const item of packages) {
      const identity = `${item.name}@${item.version}`;
      if (identities.has(identity)) errors.push(`runtime dependency manifest duplicates ${identity}`);
      identities.add(identity);
      if (!item.name || !item.version || !item.license || !Array.isArray(item.inputs) || item.inputs.length === 0) errors.push(`runtime dependency entry is incomplete: ${identity}`);
      if (typeof item.license_file !== "string" || !item.license_file.startsWith("licenses/") || path.isAbsolute(item.license_file) || item.license_file.includes("..")) {
        errors.push(`runtime dependency license path is unsafe: ${identity}`);
        continue;
      }
      expectedLicenseFiles.push(path.basename(item.license_file));
      const licensePath = path.join(pluginRoot, item.license_file);
      if (requireFile(licensePath) && fs.statSync(licensePath).size === 0) errors.push(`runtime dependency license is empty: ${item.license_file}`);
      const noticeLine = `- ${item.name} ${item.version} — ${item.license} — \`${item.license_file}\``;
      if (!notices.includes(noticeLine)) errors.push(`third-party notices do not cover ${identity}`);
    }
    const licensesRoot = path.join(pluginRoot, "licenses");
    const observedLicenseFiles = fs.existsSync(licensesRoot) ? fs.readdirSync(licensesRoot).sort() : [];
    if (JSON.stringify(observedLicenseFiles) !== JSON.stringify(expectedLicenseFiles.sort())) errors.push("distributed license file set does not match runtime dependency manifest");
  }
}
const reportSchema = readJson(
  path.join(pluginRoot, "references", "review-report.schema.json"),
  "review report schema"
);
const legacyReportSchema = readJson(
  path.join(pluginRoot, "references", "schemas", "review-report.v1.1.schema.json"),
  "legacy review report schema"
);
const bmadExtensionSchema = readJson(
  path.join(pluginRoot, "references", "extensions", "bmad", "review-report-bmad.v1.schema.json"),
  "BMAD report extension schema"
);
if (reportSchema) {
  if (reportSchema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    errors.push("review report schema must use JSON Schema draft 2020-12");
  }
  if (reportSchema.properties?.schema_version?.const !== "2.0") {
    errors.push('review report schema must define schema_version const "2.0"');
  }
  for (const field of ["findings", "not_verified", "mode_data", "artifacts"]) {
    if (!reportSchema.required?.includes(field)) {
      errors.push(`review report schema must require ${field}`);
    }
  }
  for (const field of ["evidence", "source"]) {
    if (reportSchema.$defs?.finding?.properties?.[field]?.minItems !== 1) {
      errors.push(`review report finding ${field} must require at least one item`);
    }
  }
}
if (legacyReportSchema?.properties?.schema_version?.const !== "1.1") {
  errors.push('legacy review report schema must preserve schema_version const "1.1"');
}
if (bmadExtensionSchema?.properties?.schema_version?.const !== "1.0") {
  errors.push('BMAD extension schema must define schema_version const "1.0"');
}

try {
  const runtimePath = path.join(pluginRoot, "scripts", "runtime", "review-runtime.mjs");
  const runtime = await import(`${pathToFileURL(runtimePath).href}?plugin-validation`);
  const fixture = readJson(path.join(pluginRoot, "tests", "fixtures", "reports", "v2", "regulars-clean.json"), "standalone runtime fixture");
  if (fixture) {
    const validation = runtime.validateReport(fixture);
    if (validation.valid !== true) errors.push(`standalone runtime rejected its regulars fixture: ${JSON.stringify(validation.errors ?? [])}`);
  }
} catch (error) {
  errors.push(`Standalone runtime validation could not run: ${error.message}`);
}

const expectedSkills = [
  ["review-squad", "review-squad"],
  ["experts", "experts"],
  ["normies", "normies"],
  ["regulars", "regulars"],
  ["well-actually", "well-actually"]
];

const dispatchPolicyPath = path.join(
  pluginRoot,
  "references",
  "dispatch-policy.md"
);
if (requireFile(dispatchPolicyPath)) {
  const dispatchPolicy = fs.readFileSync(dispatchPolicyPath, "utf8");
  for (const status of [
    "Status: panel proposal — auto-approved",
    "Status: panel proposal — approval required"
  ]) {
    if (!dispatchPolicy.includes(status)) {
      errors.push(`Dispatch policy is missing status format: ${status}`);
    }
  }
}

for (const [directory, expectedName] of expectedSkills) {
  const skillPath = path.join(pluginRoot, "skills", directory, "SKILL.md");
  const fm = readFrontmatter(skillPath);
  if (fm?.name && fm.name !== expectedName) {
    errors.push(`Skill ${rel(skillPath)} name must be "${expectedName}", got "${fm.name}"`);
  }

  if (directory !== "review-squad" && exists(skillPath)) {
    const skillText = fs.readFileSync(skillPath, "utf8");
    if (!skillText.includes("../../references/dispatch-policy.md")) {
      errors.push(`Skill ${rel(skillPath)} must load dispatch-policy.md`);
    }
    if (skillText.includes("Ask the user to approve or customize the panel.")) {
      errors.push(`Skill ${rel(skillPath)} still requires unconditional approval`);
    }
  }

  if (exists(skillPath)) {
    const skillText = fs.readFileSync(skillPath, "utf8");
    if (!skillText.includes("../../references/report-formats.md")) {
      errors.push(`Skill ${rel(skillPath)} must load report-formats.md`);
    }
    if (skillText.includes('schema_version: "1.1"')) {
      errors.push(`Skill ${rel(skillPath)} still requires schema 1.1 writer output`);
    }
  }
}

try {
  errors.push(...validatePluginCatalogState(loadPluginCatalogState(pluginRoot)).map((error) => `Catalog: ${error}`));
} catch (error) {
  errors.push(`Catalog validation could not run: ${error.message}`);
}

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Validation passed: review-squad plugin structure is complete.");
