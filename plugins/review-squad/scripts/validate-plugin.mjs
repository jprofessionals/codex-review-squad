#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");

const errors = [];
const missing = new Set();

function rel(file) {
  return path.relative(repoRoot, file) || ".";
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
  path.join(repoRoot, ".agents", "plugins", "marketplace.json"),
  path.join(pluginRoot, ".codex-plugin", "plugin.json"),
  path.join(pluginRoot, ".mcp.json"),
  path.join(pluginRoot, "LICENSE"),
  path.join(pluginRoot, "NOTICE.md"),
  path.join(pluginRoot, "references", "panels.md"),
  path.join(pluginRoot, "references", "browser-preflight.md"),
  path.join(pluginRoot, "references", "report-formats.md"),
  path.join(pluginRoot, "references", "review-report.schema.json"),
  path.join(pluginRoot, "scripts", "validate-plugin.mjs")
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
  if (manifest.skills !== "./skills/") {
    errors.push('plugin manifest must reference skills as "./skills/"');
  }
  if (manifest.mcpServers !== "./.mcp.json") {
    errors.push('plugin manifest must reference Playwright MCP as "./.mcp.json"');
  }
}

readJson(path.join(pluginRoot, ".mcp.json"), "plugin MCP config");
const reportSchema = readJson(
  path.join(pluginRoot, "references", "review-report.schema.json"),
  "review report schema"
);
if (reportSchema) {
  if (reportSchema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    errors.push("review report schema must use JSON Schema draft 2020-12");
  }
  if (reportSchema.properties?.schema_version?.const !== "1.1") {
    errors.push('review report schema must define schema_version const "1.1"');
  }
  for (const field of ["decision_summary", "findings", "not_verified", "mode_data"]) {
    if (!reportSchema.required?.includes(field)) {
      errors.push(`review report schema must require ${field}`);
    }
  }
  const findingRequired = reportSchema.$defs?.finding?.required ?? [];
  for (const field of ["impact", "human_gate_summary", "workflow", "bmad"]) {
    if (!findingRequired.includes(field)) {
      errors.push(`review report finding schema must require ${field}`);
    }
  }
}

const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
const marketplace = readJson(marketplacePath, "marketplace");
if (marketplace) {
  const entry = marketplace.plugins?.find((plugin) => plugin.name === "review-squad");
  if (!entry) {
    errors.push("marketplace is missing a review-squad plugin entry");
  } else {
    if (entry.source?.source !== "local") {
      errors.push('marketplace review-squad source.source must be "local"');
    }
    if (entry.source?.path !== "./plugins/review-squad") {
      errors.push('marketplace review-squad source.path must be "./plugins/review-squad"');
    }
    if (!entry.policy?.installation) {
      errors.push("marketplace review-squad policy.installation is required");
    }
    if (!entry.policy?.authentication) {
      errors.push("marketplace review-squad policy.authentication is required");
    }
    if (!entry.category) {
      errors.push("marketplace review-squad category is required");
    }
  }
}

const expectedSkills = [
  ["review-squad", "review-squad"],
  ["experts", "experts"],
  ["normies", "normies"],
  ["regulars", "regulars"],
  ["well-actually", "well-actually"]
];

for (const [directory, expectedName] of expectedSkills) {
  const skillPath = path.join(pluginRoot, "skills", directory, "SKILL.md");
  const fm = readFrontmatter(skillPath);
  if (fm?.name && fm.name !== expectedName) {
    errors.push(`Skill ${rel(skillPath)} name must be "${expectedName}", got "${fm.name}"`);
  }
}

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Validation passed: review-squad plugin structure is complete.");
