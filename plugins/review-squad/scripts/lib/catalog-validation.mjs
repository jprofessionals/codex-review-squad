import fs from "node:fs";
import path from "node:path";

export function validatePluginCatalogState({catalog, schema, manifest, skillTexts}) {
  const errors = [];
  const unique = (items, label) => {
    const duplicates = items.filter((item, index) => items.indexOf(item) !== index);
    if (duplicates.length) errors.push(`${label} contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}`);
  };

  const modeIds = catalog.modes.map(({id}) => id);
  const projectIds = catalog.project_types.map(({id}) => id);
  const tierIds = catalog.model_tiers.map(({id}) => id);
  const safetyIds = catalog.safety_classes.map(({id}) => id);
  const laneIds = catalog.lanes.map(({id}) => id);
  for (const [items, label] of [[modeIds, "modes"], [projectIds, "project types"], [tierIds, "model tiers"], [safetyIds, "safety classes"], [laneIds, "lanes"]]) unique(items, label);

  if (JSON.stringify([...modeIds].sort()) !== JSON.stringify([...schema.properties.mode.enum].sort())) errors.push("catalog modes do not match report schema mode enum");
  const catalogSkills = catalog.modes.map(({skill}) => skill);
  if (JSON.stringify([...catalogSkills].sort()) !== JSON.stringify([...schema.properties.generator.properties.skill.enum].sort())) errors.push("catalog skills do not match report schema generator skills");
  if (JSON.stringify([...catalog.severity.values].sort()) !== JSON.stringify([...schema.$defs.finding.properties.severity.enum].sort())) errors.push("catalog severities do not match report schema");

  for (const mode of catalog.modes) {
    if (mode.skill !== `review-squad:${mode.id}`) errors.push(`mode ${mode.id} has inconsistent skill ${mode.skill}`);
    if (!safetyIds.includes(mode.safety_class)) errors.push(`mode ${mode.id} references unknown safety class ${mode.safety_class}`);
    const skillText = skillTexts[mode.id];
    if (skillText == null) errors.push(`missing skill for mode ${mode.id}`);
    else if (!skillText.includes("../../references/review-catalog.json")) errors.push(`skill ${mode.id} does not load review-catalog.json`);
    const prompts = manifest.interface.defaultPrompt.filter((prompt) => prompt.includes(`review-squad:${mode.id}`));
    if (prompts.length !== 1) errors.push(`manifest must contain exactly one default prompt for ${mode.id}`);
    const definition = `${mode.id.replaceAll("-", "_")}_data`;
    if (!schema.$defs[definition]) errors.push(`report schema is missing ${definition}`);
    const branches = schema.allOf.filter((branch) => branch.if?.properties?.mode?.const === mode.id);
    if (branches.length !== 1) errors.push(`report schema must contain exactly one conditional branch for ${mode.id}`);
  }

  for (const lane of catalog.lanes) {
    if (!tierIds.includes(lane.tier)) errors.push(`lane ${lane.id} references unknown tier ${lane.tier}`);
    if (!safetyIds.includes(lane.safety_class)) errors.push(`lane ${lane.id} references unknown safety class ${lane.safety_class}`);
    for (const project of lane.projects) if (!projectIds.includes(project)) errors.push(`lane ${lane.id} references unknown project ${project}`);
  }

  if (catalog.dispatch.ordinary_initial_lanes !== 3) errors.push("ordinary expert dispatch must start with three lanes");
  if (catalog.dispatch.auto_dispatch_limit !== 5) errors.push("automatic escalation must stop at five lanes");
  if (catalog.dispatch.approval_lane_count !== 6) errors.push("six lanes must require approval");
  return errors;
}

export function validateRepositoryCatalogState({catalog, readme, marketplace}) {
  const errors = [];
  for (const mode of catalog.modes) {
    if (!readme.includes(`review-squad:${mode.id}`)) errors.push(`README does not document ${mode.id}`);
  }
  const entry = marketplace?.plugins?.find((plugin) => plugin.name === "review-squad");
  if (!entry) return [...errors, "marketplace is missing a review-squad plugin entry"];
  if (entry.source?.source !== "local") errors.push('marketplace review-squad source.source must be "local"');
  if (entry.source?.path !== "./plugins/review-squad") errors.push('marketplace review-squad source.path must be "./plugins/review-squad"');
  if (!entry.policy?.installation) errors.push("marketplace review-squad policy.installation is required");
  if (!entry.policy?.authentication) errors.push("marketplace review-squad policy.authentication is required");
  if (!entry.category) errors.push("marketplace review-squad category is required");
  return errors;
}

export function validateCatalogState(state) {
  return [...validatePluginCatalogState(state), ...validateRepositoryCatalogState(state)];
}

export function loadPluginCatalogState(pluginRoot) {
  const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const catalog = readJson(path.join(pluginRoot, "references", "review-catalog.json"));
  return {
    catalog,
    schema: readJson(path.join(pluginRoot, "references", "review-report.schema.json")),
    manifest: readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json")),
    skillTexts: Object.fromEntries(catalog.modes.map(({id}) => [id, fs.existsSync(path.join(pluginRoot, "skills", id, "SKILL.md")) ? fs.readFileSync(path.join(pluginRoot, "skills", id, "SKILL.md"), "utf8") : null]))
  };
}

export function loadCatalogState(pluginRoot, repoRoot) {
  const state = loadPluginCatalogState(pluginRoot);
  return {
    ...state,
    readme: fs.readFileSync(path.join(repoRoot, "README.md"), "utf8"),
    marketplace: JSON.parse(fs.readFileSync(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), "utf8"))
  };
}
