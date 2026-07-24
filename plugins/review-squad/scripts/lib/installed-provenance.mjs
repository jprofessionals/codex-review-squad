import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertStrictOutputSchema} from "./strict-output-schema.mjs";

export const INSTALLED_SKILLS = ["review-squad", "experts", "normies", "regulars", "well-actually"];
export const AMBIENT_REVIEW_SQUAD_PLUGIN_ID = "review-squad@codex-review-squad";
export const DISABLED_MCP_SENTINEL_COMMAND = "RG07_DISABLED_MCP_MUST_NOT_START";

export class ProvenanceError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "ProvenanceError";
    this.diagnostic = {kind, message, ...details};
  }
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function fail(kind, message, details) {
  throw new ProvenanceError(kind, message, details);
}

function requireFile(file, label) {
  try {
    if (fs.statSync(file).isFile()) return;
  } catch {}
  fail("installed_cache_content_failure", `${label} is missing from the installed cache`, {path: file});
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch {}
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}

export function readSkillFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) fail("installed_cache_content_failure", "installed skill frontmatter is missing", {path: file});
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (field) fields[field[1]] = unquote(field[2]);
  }
  if (!fields.name || !fields.description) fail("installed_cache_content_failure", "installed skill frontmatter lacks name or description", {path: file});
  return {name: fields.name, description: fields.description};
}

export function ambientReviewSquadDisableArgs() {
  return [
    "-c", `plugins."${AMBIENT_REVIEW_SQUAD_PLUGIN_ID}".enabled=false`,
    "-c", `plugins."${AMBIENT_REVIEW_SQUAD_PLUGIN_ID}".mcp_servers.playwright.enabled=false`
  ];
}

const tomlString = (value) => JSON.stringify(value);

export function configuredMcpServerNamesFromToml(text) {
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*\[mcp_servers\.("(?:\\.|[^"\\])*")(?=\.|\])|^\s*\[mcp_servers\.([A-Za-z0-9_-]+)(?=\.|\])/);
    if (!match) continue;
    names.add(match[1] ? JSON.parse(match[1]) : match[2]);
  }
  return [...names].sort();
}

export function ambientConfigWarningsFromToml(text) {
  return text.split(/\r?\n/).flatMap((line, index) => /^\s*approvals_policy\s*=/.test(line) ? [{
    code: "RG07_AMBIENT_CONFIG_LEGACY_FIELD",
    line_number: index + 1,
    observed_field: "approvals_policy",
    suggested_field: "approval_policy",
    message: "Ambient Codex config uses legacy/invalid `approvals_policy`; use `approval_policy`. The field is not copied into the RG-07 profile and does not block this plugin-specific smoke test."
  }] : []);
}

export function renderFreshSessionProfile({pluginName, marketplaceName, marketplaceRoot, preExistingPluginIds, mcpServerNames}) {
  const pluginId = `${pluginName}@${marketplaceName}`;
  const lines = [
    "# Generated for one RG-07 provenance session; contains no credentials.",
    ...[...new Set(preExistingPluginIds)].sort().flatMap((id) => [
      `[plugins.${tomlString(id)}]`,
      "enabled = false",
      ""
    ]),
    `[plugins.${tomlString(pluginId)}]`,
    "enabled = true",
    "",
    `[plugins.${tomlString(pluginId)}.mcp_servers.playwright]`,
    "enabled = false",
    "",
    `[plugins.${tomlString(AMBIENT_REVIEW_SQUAD_PLUGIN_ID)}.mcp_servers.playwright]`,
    "enabled = false",
    "",
    ...[...new Set(mcpServerNames)].sort().flatMap((name) => [
      `[mcp_servers.${tomlString(name)}]`,
      `command = ${tomlString(DISABLED_MCP_SENTINEL_COMMAND)}`,
      "enabled = false",
      ""
    ]),
    `[marketplaces.${tomlString(marketplaceName)}]`,
    'source_type = "local"',
    `source = ${tomlString(marketplaceRoot)}`,
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function profileFailure(message, details = {}) {
  fail("temporary_profile_validation_failure", message, details);
}

function parseGeneratedProfile(text) {
  const sections = new Map();
  let current = null;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const header = line.match(/^\[(plugins|mcp_servers|marketplaces)\.("(?:\\.|[^"\\])*")(\.mcp_servers\.playwright)?\]$/);
    if (header) {
      const kind = header[1];
      const name = JSON.parse(header[2]);
      const suffix = header[3] ?? "";
      current = `${kind}:${name}${suffix}`;
      if (sections.has(current)) profileFailure("temporary profile contains a duplicate section", {line_number: index + 1, section: current});
      sections.set(current, {});
      continue;
    }
    if (!current) profileFailure("temporary profile contains a value outside an allowed section", {line_number: index + 1});
    const assignment = line.match(/^(command|enabled|source_type|source)\s*=\s*(true|false|"(?:\\.|[^"\\])*")$/);
    if (!assignment) profileFailure("temporary profile contains an unsupported or invalid TOML assignment", {line_number: index + 1, line});
    const values = sections.get(current);
    const key = assignment[1];
    if (Object.hasOwn(values, key)) profileFailure("temporary profile contains a duplicate key", {line_number: index + 1, section: current, key});
    values[key] = assignment[2] === "true" ? true : assignment[2] === "false" ? false : JSON.parse(assignment[2]);
  }
  return sections;
}

export function validateFreshSessionProfile({text, pluginName, marketplaceName, marketplaceRoot, preExistingPluginIds, mcpServerNames}) {
  const pluginId = `${pluginName}@${marketplaceName}`;
  const expected = new Map();
  for (const id of [...new Set(preExistingPluginIds)].sort()) expected.set(`plugins:${id}`, {enabled: false});
  expected.set(`plugins:${pluginId}`, {enabled: true});
  expected.set(`plugins:${pluginId}.mcp_servers.playwright`, {enabled: false});
  expected.set(`plugins:${AMBIENT_REVIEW_SQUAD_PLUGIN_ID}.mcp_servers.playwright`, {enabled: false});
  for (const name of [...new Set(mcpServerNames)].sort()) expected.set(`mcp_servers:${name}`, {command: DISABLED_MCP_SENTINEL_COMMAND, enabled: false});
  expected.set(`marketplaces:${marketplaceName}`, {source_type: "local", source: marketplaceRoot});

  const observed = parseGeneratedProfile(text);
  const missing = [...expected.keys()].filter((key) => !observed.has(key));
  const unexpected = [...observed.keys()].filter((key) => !expected.has(key));
  const mismatches = [...expected].flatMap(([key, value]) => observed.has(key) && JSON.stringify(observed.get(key)) !== JSON.stringify(value)
    ? [{section: key, expected: value, observed: observed.get(key)}]
    : []);
  if (missing.length || unexpected.length || mismatches.length) {
    profileFailure("temporary profile does not match the closed-world isolation contract", {missing, unexpected, mismatches});
  }
  return {
    status: "verified",
    syntax: "valid_restricted_toml",
    exact_unique_plugin_enabled: true,
    ambient_plugins_disabled: [...new Set(preExistingPluginIds)].sort(),
    temporary_playwright_disabled: true,
    ambient_playwright_disabled: true,
    ambient_mcp_servers_disabled: [...new Set(mcpServerNames)].sort(),
    ambient_mcp_transport_policy: `replaced_with_disabled_inert_stdio:${DISABLED_MCP_SENTINEL_COMMAND}`,
    unrelated_settings_or_credentials: "absent"
  };
}

export function validateFreshSessionArgs({args, pluginName, marketplaceName, mcpServerNames}) {
  const pluginId = `${pluginName}@${marketplaceName}`;
  const configValues = args.flatMap((value, index) => value === "-c" && index + 1 < args.length ? [args[index + 1]] : []);
  const requiredConfig = [
    'approval_policy="never"',
    `plugins."${AMBIENT_REVIEW_SQUAD_PLUGIN_ID}".enabled=false`,
    `plugins."${AMBIENT_REVIEW_SQUAD_PLUGIN_ID}".mcp_servers.playwright.enabled=false`,
    `plugins."${pluginId}".enabled=true`,
    `plugins."${pluginId}".mcp_servers.playwright.enabled=false`,
  ];
  const missing = requiredConfig.filter((value) => configValues.filter((observed) => observed === value).length !== 1);
  const unexpectedMcp = configValues.filter((value) => value.startsWith("mcp_servers."));
  const sandboxIndex = args.indexOf("-s");
  if (missing.length || unexpectedMcp.length || sandboxIndex < 0 || args[sandboxIndex + 1] !== "read-only" || args.includes("--strict-config") || args.includes("--ignore-user-config")) {
    fail("fresh_session_invocation_validation_failure", "fresh-session argv does not match the isolation contract", {
      missing_or_duplicated_config: missing,
      unexpected_mcp_overrides: unexpectedMcp,
      sandbox: sandboxIndex < 0 ? null : args[sandboxIndex + 1],
      strict_config_present: args.includes("--strict-config"),
      ignore_user_config_present: args.includes("--ignore-user-config")
    });
  }
  return {
    status: "verified",
    approval_policy: "never",
    sandbox: "read-only",
    ambient_plugin_disabled: true,
    temporary_plugin_enabled: true,
    ambient_and_temporary_playwright_disabled: true,
    ambient_mcp_servers_disabled_by_profile: [...new Set(mcpServerNames)].sort()
  };
}

export function buildFreshSessionArgs({pluginName, marketplaceName, profileName, mcpServerNames, sessionCwd, responseSchemaPath, sessionFinalPath, prompt}) {
  const pluginId = `${pluginName}@${marketplaceName}`;
  return [
    "exec", "--ephemeral", "--json", "--ignore-rules", "--skip-git-repo-check",
    "--profile", profileName,
    "-m", "gpt-5.6-sol", "-c", 'model_reasoning_effort="high"', "-c", 'approval_policy="never"',
    ...ambientReviewSquadDisableArgs(),
    "-c", `plugins."${pluginId}".enabled=true`,
    "-c", `plugins."${pluginId}".mcp_servers.playwright.enabled=false`,
    "-s", "read-only", "-C", sessionCwd, "--output-schema", responseSchemaPath,
    "-o", sessionFinalPath, prompt
  ];
}

export function buildFreshDiscoveryPrompt(pluginName) {
  return `Authorized RG-07 behavioral discovery check for the unique temporary plugin namespace ${pluginName}. Inspect only the Available Skills section of your system instructions. Plugin skill keys use a plugin-name prefix followed by a colon. Copy every displayed entry whose key begins exactly ${pluginName}: into temporary_plugin_entries, preserving its exact key and description. Copy every displayed entry whose key begins exactly review-squad: into ambient_review_squad_entries. Copy a source locator only when that same system entry explicitly exposes one; otherwise use null. Do not infer, construct, or omit entries. If the system Available Skills section is not exposed, set inventory_source to not_exposed and return empty arrays. Do not browse, run commands, inspect files, dispatch subagents, start MCP or browser tools, or write files. Return only the required JSON.`;
}

const inventoryEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["skill_key", "description", "source_locator"],
  properties: {
    skill_key: {type: "string"},
    description: {type: "string"},
    source_locator: {type: ["string", "null"]}
  }
};

export function buildInstalledProvenanceSchema(pluginName) {
  return assertStrictOutputSchema({
    type: "object",
    additionalProperties: false,
    required: ["temporary_plugin_namespace", "inventory_source", "ambient_review_squad_entries", "temporary_plugin_entries"],
    properties: {
      temporary_plugin_namespace: {type: "string", const: pluginName},
      inventory_source: {type: "string", enum: ["system_available_skills", "not_exposed"]},
      ambient_review_squad_entries: {type: "array", items: inventoryEntrySchema},
      temporary_plugin_entries: {type: "array", items: inventoryEntrySchema}
    }
  }, {name: "RG-07 provenance schema"});
}

export function verifyInstallationReceipt({receipt, marketplaceSourcePath, temporarySourceRoot, expectedName, expectedVersion}) {
  const suppliedPath = receipt?.installedPath;
  if (typeof suppliedPath !== "string" || !path.isAbsolute(suppliedPath)) {
    fail("installation_receipt_failure", "plugin-add receipt lacks an absolute installedPath", {installed_path: suppliedPath ?? null});
  }
  let installedRoot;
  let marketplaceSourceRoot;
  try {
    installedRoot = fs.realpathSync(suppliedPath);
  } catch (error) {
    fail("installation_receipt_failure", "plugin-add installedPath does not exist", {installed_path: suppliedPath, code: error.code ?? null});
  }
  try {
    marketplaceSourceRoot = fs.realpathSync(marketplaceSourcePath);
  } catch (error) {
    fail("installation_receipt_failure", "marketplace source path does not exist", {marketplace_source_path: marketplaceSourcePath, code: error.code ?? null});
  }
  if (installedRoot === marketplaceSourceRoot) {
    fail("installation_receipt_failure", "plugin-add installedPath resolves to the marketplace source", {installed_path: installedRoot, marketplace_source_path: marketplaceSourceRoot});
  }

  const sourceRoot = fs.realpathSync(temporarySourceRoot);
  const manifestPath = path.join(installedRoot, ".codex-plugin", "plugin.json");
  requireFile(manifestPath, "installed manifest");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail("installed_cache_content_failure", "installed manifest is not valid JSON", {path: manifestPath, message: error.message});
  }
  if (manifest.name !== expectedName || manifest.version !== expectedVersion) {
    fail("installed_cache_content_failure", "installed manifest identity or cachebuster differs from the installation request", {
      path: manifestPath,
      expected: {name: expectedName, version: expectedVersion},
      observed: {name: manifest.name ?? null, version: manifest.version ?? null}
    });
  }

  const relevant = [
    ".codex-plugin/plugin.json",
    ...INSTALLED_SKILLS.map((skill) => path.join("skills", skill, "SKILL.md")),
    path.join("scripts", "runtime", "review-runtime.mjs"),
    path.join("tests", "fixtures", "reports", "v2", "regulars-clean.json")
  ];
  const files = {};
  for (const relativePath of relevant) {
    const installedFile = path.join(installedRoot, relativePath);
    const sourceFile = path.join(sourceRoot, relativePath);
    requireFile(installedFile, relativePath);
    requireFile(sourceFile, `temporary source ${relativePath}`);
    const installedContent = fs.readFileSync(installedFile);
    const sourceContent = fs.readFileSync(sourceFile);
    const installedHash = sha256(installedContent);
    const sourceHash = sha256(sourceContent);
    if (installedHash !== sourceHash) {
      fail("installed_cache_content_failure", "installed file differs from the temporary source copy", {relative_path: relativePath, installed_sha256: installedHash, source_sha256: sourceHash});
    }
    files[relativePath] = {installed_path: installedFile, installed_sha256: installedHash, source_path: sourceFile, source_sha256: sourceHash};
  }

  const skillMetadata = {};
  for (const skill of INSTALLED_SKILLS) {
    const skillPath = path.join(installedRoot, "skills", skill, "SKILL.md");
    const metadata = readSkillFrontmatter(skillPath);
    if (metadata.name !== skill) fail("installed_cache_content_failure", "installed skill folder and frontmatter name differ", {skill, observed_name: metadata.name, path: skillPath});
    skillMetadata[skill] = {...metadata, skill_key: `${expectedName}:${skill}`, installed_path: skillPath};
  }

  return {
    status: "verified",
    receipt_installed_path: suppliedPath,
    installed_real_path: installedRoot,
    marketplace_source_real_path: marketplaceSourceRoot,
    paths_differ: true,
    manifest_path: manifestPath,
    manifest,
    skill_metadata: skillMetadata,
    runtime_path: path.join(installedRoot, "scripts", "runtime", "review-runtime.mjs"),
    fixture_path: path.join(installedRoot, "tests", "fixtures", "reports", "v2", "regulars-clean.json"),
    compared_files: files
  };
}

function recordedEvidenceFailure(message, details = {}) {
  fail("recorded_installation_evidence_failure", message, details);
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function verifyRecordedInstallationEvidence(result) {
  const identities = result?.identities;
  const installation = result?.installation_receipt;
  if (!identities || installation?.status !== "verified") recordedEvidenceFailure("recorded installation receipt is missing or unverified");
  const pluginAdd = result.commands?.find(({label}) => label === "plugin_add");
  if (!pluginAdd || pluginAdd.code !== 0) recordedEvidenceFailure("recorded plugin-add command did not succeed");
  const installedRoot = installation.installed_real_path;
  const sourceRoot = installation.marketplace_source_real_path;
  if (!path.isAbsolute(installedRoot ?? "") || !path.isAbsolute(sourceRoot ?? "") || installedRoot === sourceRoot || installation.paths_differ !== true) {
    recordedEvidenceFailure("recorded installedPath provenance is invalid", {installed_root: installedRoot ?? null, source_root: sourceRoot ?? null});
  }
  if (pluginAdd.json?.installedPath !== installation.receipt_installed_path || pluginAdd.json?.installedPath !== installedRoot) {
    recordedEvidenceFailure("plugin-add installedPath and recorded receipt disagree");
  }
  if (pluginAdd.json?.name !== identities.plugin_name || pluginAdd.json?.version !== identities.cachebuster || pluginAdd.json?.pluginId !== identities.plugin_id) {
    recordedEvidenceFailure("plugin-add identity and expected temporary identity disagree");
  }
  if (installation.manifest?.name !== identities.plugin_name || installation.manifest?.version !== identities.cachebuster) {
    recordedEvidenceFailure("recorded installed manifest identity or cachebuster is wrong");
  }

  const expectedFiles = [
    ".codex-plugin/plugin.json",
    ...INSTALLED_SKILLS.map((skill) => path.join("skills", skill, "SKILL.md")),
    path.join("scripts", "runtime", "review-runtime.mjs"),
    path.join("tests", "fixtures", "reports", "v2", "regulars-clean.json")
  ];
  const observedFiles = Object.keys(installation.compared_files ?? {}).sort();
  if (JSON.stringify(observedFiles) !== JSON.stringify([...expectedFiles].sort())) {
    recordedEvidenceFailure("recorded installed/source comparison set is incomplete", {expected: expectedFiles.sort(), observed: observedFiles});
  }
  for (const relativePath of expectedFiles) {
    const file = installation.compared_files[relativePath];
    if (!/^[a-f0-9]{64}$/.test(file?.installed_sha256 ?? "") || file.installed_sha256 !== file.source_sha256) {
      recordedEvidenceFailure("recorded installed/source file hashes do not match", {relative_path: relativePath});
    }
    if (!pathIsWithin(installedRoot, file.installed_path) || !pathIsWithin(sourceRoot, file.source_path)) {
      recordedEvidenceFailure("recorded compared file lies outside its declared root", {relative_path: relativePath});
    }
  }

  const skillMetadata = installation.skill_metadata ?? {};
  if (JSON.stringify(Object.keys(skillMetadata).sort()) !== JSON.stringify([...INSTALLED_SKILLS].sort())) {
    recordedEvidenceFailure("recorded installed skill inventory is incomplete");
  }
  for (const skill of INSTALLED_SKILLS) {
    const metadata = skillMetadata[skill];
    if (metadata?.name !== skill || metadata?.skill_key !== `${identities.plugin_name}:${skill}` || typeof metadata.description !== "string" || !metadata.description) {
      recordedEvidenceFailure("recorded installed skill metadata is invalid", {skill});
    }
    if (metadata.installed_path !== installation.compared_files[path.join("skills", skill, "SKILL.md")].installed_path) {
      recordedEvidenceFailure("recorded installed skill path disagrees with compared-file evidence", {skill});
    }
  }

  const runtime = result.commands?.find(({label}) => label === "installed_runtime_validate");
  if (!runtime || runtime.code !== 0 || runtime.process_exit_confirmed !== true || runtime.command?.at(-3) !== installation.runtime_path || runtime.command?.at(-2) !== "validate" || runtime.command?.at(-1) !== installation.fixture_path) {
    recordedEvidenceFailure("recorded installed runtime validation is incomplete or inconsistent");
  }
  const requiredChecks = ["installation_receipt", "installed_path_differs_from_marketplace_source", "installed_manifest_identity", "installed_cache_content", "installed_runtime_validation"];
  const failedChecks = requiredChecks.filter((check) => result.checks?.[check] !== "passed");
  if (failedChecks.length) recordedEvidenceFailure("recorded installation/runtime checks did not pass", {failed_checks: failedChecks});

  return {
    status: "verified",
    installed_path_authority: "codex_plugin_add_json_installedPath",
    installed_real_path: installedRoot,
    marketplace_source_real_path: sourceRoot,
    manifest: {name: installation.manifest.name, version: installation.manifest.version},
    compared_file_count: expectedFiles.length,
    compared_files: installation.compared_files,
    skill_metadata: skillMetadata,
    runtime_validation: {status: "passed", command: runtime.command, exit_code: runtime.code, process_exit_confirmed: true}
  };
}

export function verifyFreshSessionDiscovery({response, pluginName, installation}) {
  if (response?.temporary_plugin_namespace !== pluginName) {
    fail("fresh_session_discovery_failure", "fresh session returned the wrong temporary plugin namespace", {expected: pluginName, observed: response?.temporary_plugin_namespace ?? null});
  }
  if (response?.inventory_source !== "system_available_skills") {
    fail("fresh_session_discovery_failure", "fresh session did not expose the system Available Skills inventory", {inventory_source: response?.inventory_source ?? null});
  }
  const ambient = response?.ambient_review_squad_entries;
  const temporary = response?.temporary_plugin_entries;
  if (!Array.isArray(ambient) || !Array.isArray(temporary)) {
    fail("fresh_session_discovery_failure", "fresh session inventory arrays are missing", {});
  }
  if (ambient.length) {
    fail("fresh_session_discovery_failure", "ambient Review Squad entries remained visible", {ambient_entries: ambient});
  }

  const expected = new Map(Object.values(installation.skill_metadata).map((item) => [item.skill_key, item]));
  const observed = new Map();
  const duplicates = [];
  for (const entry of temporary) {
    if (observed.has(entry.skill_key)) duplicates.push(entry.skill_key);
    observed.set(entry.skill_key, entry);
  }
  const missing = [...expected.keys()].filter((key) => !observed.has(key));
  const unexpected = [...observed.keys()].filter((key) => !expected.has(key));
  const descriptionMismatches = [...expected].flatMap(([key, metadata]) => observed.has(key) && observed.get(key).description !== metadata.description
    ? [{skill_key: key, expected: metadata.description, observed: observed.get(key).description}]
    : []);
  if (temporary.length !== expected.size || duplicates.length || missing.length || unexpected.length || descriptionMismatches.length) {
    fail("fresh_session_discovery_failure", "fresh session skill inventory does not match installed skill frontmatter", {
      expected_count: expected.size,
      observed_count: temporary.length,
      duplicates,
      missing,
      unexpected,
      description_mismatches: descriptionMismatches
    });
  }

  const locatorMismatches = [...expected].flatMap(([key, metadata]) => {
    const locator = observed.get(key).source_locator;
    if (locator === null) return [];
    const resolved = path.resolve(locator);
    return resolved === metadata.installed_path ? [] : [{skill_key: key, model_locator: locator, installed_path: metadata.installed_path, model_locator_exists: fs.existsSync(resolved)}];
  });
  return {
    status: "verified",
    inventory_source: response.inventory_source,
    ambient_entries: [],
    temporary_entries: temporary,
    expected_skill_keys: [...expected.keys()].sort(),
    optional_model_locator_alignment: locatorMismatches.length ? "mismatch_non_authoritative" : "matched_or_not_exposed",
    optional_model_locator_mismatches: locatorMismatches
  };
}

export function assessRg07Cleanup({attempts, scratchRootRemoved, checks}) {
  const failedAttempts = attempts.filter(({status}) => status !== "passed").map(({label, status}) => ({label, status}));
  const failedChecks = Object.entries(checks).filter(([, status]) => status !== "passed").map(([check, status]) => ({check, status}));
  if (failedAttempts.length || !scratchRootRemoved || failedChecks.length) {
    return {status: "failed", diagnostic: {kind: "cleanup_failure", failed_attempts: failedAttempts, scratch_root_removed: scratchRootRemoved, failed_checks: failedChecks}};
  }
  return {status: "passed", diagnostic: null};
}
