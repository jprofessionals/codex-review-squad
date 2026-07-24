import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parse} from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.resolve(here, "..", "..", "references", "review-catalog.json"), "utf8"));

const installations = [
  {kind: "modern", root: "_bmad/", manifest: "_bmad/_config/manifest.yaml"},
  {kind: "legacy", root: ".bmad-core/", manifest: ".bmad-core/install-manifest.yaml"}
];

function normalizeModules(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value && typeof value === "object") return Object.keys(value);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function readCandidate(signals, candidate) {
  const raw = signals[candidate.manifest];
  if (typeof raw !== "string") return null;
  try {
    const data = parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("manifest is not a mapping");
    const modules = normalizeModules(data.modules ?? data.installed_modules ?? data.installation?.modules);
    const version = data.version ?? data.installation?.version ?? null;
    const channel = data.channel ?? data.installation?.channel ?? null;
    const sha = data.sha ?? data.commit ?? data.installation?.sha ?? null;
    if (version == null && channel == null && sha == null && modules.length === 0 && data.installation == null) {
      throw new Error("manifest has no recognizable installation or module metadata");
    }
    return {...candidate, version, channel, sha, modules};
  } catch (error) {
    return {error: `${candidate.manifest}: ${error.message}`, candidate};
  }
}

function scopeActivatesBmad(context) {
  return Boolean(
    context.requested ||
    context.story ||
    context.acceptance_criteria ||
    context.lifecycle_command ||
    context.bmad_config_change ||
    context.generated_bmad_artifact
  );
}

export function detectBmad(signals = {}, context = {}) {
  const diagnostics = [];
  const confirmed = [];
  for (const candidate of installations) {
    const result = readCandidate(signals, candidate);
    if (result?.error) diagnostics.push(`BMAD installation not confirmed: ${result.error}`);
    else if (result) confirmed.push(result);
  }
  const selected = confirmed.find(({kind}) => kind === "modern") ?? confirmed.find(({kind}) => kind === "legacy") ?? null;
  if (!selected) return {state: "absent", selected: null, diagnostics};
  const active = scopeActivatesBmad(context);
  if (confirmed.length > 1 && active) diagnostics.push("Confirmed legacy installation remains alongside selected modern installation.");
  return {state: active ? "active" : "installed_inactive", selected, diagnostics};
}

export function bmadExtensionFromDetection(detection) {
  if (detection.state !== "active" || !detection.selected) return null;
  const selected = detection.selected;
  return {
    schema_version: "1.0",
    installation: {
      kind: selected.kind,
      root: selected.root,
      manifest: selected.manifest,
      version: selected.version,
      channel: selected.channel,
      sha: selected.sha,
      modules: selected.modules
    },
    ...(detection.diagnostics.length ? {diagnostics: detection.diagnostics} : {})
  };
}

function globRegex(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*" && glob[index + 1] === "*") {
      index += 1;
      if (glob[index + 1] === "/") {
        index += 1;
        pattern += "(?:[^/]+/)*";
      } else {
        pattern += ".*";
      }
    } else if (character === "*") {
      pattern += "[^/]*";
    } else {
      pattern += /[.+^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesGlob(file, glob) {
  return globRegex(glob).test(file);
}

function signalMatches(file, signal) {
  if (signal.path) return file === signal.path;
  if (signal.prefix) return file.startsWith(signal.prefix);
  if (signal.glob) return matchesGlob(file, signal.glob);
  return false;
}

export function detectProjects(input) {
  const files = [...new Set(Array.isArray(input) ? input : Object.keys(input ?? {}))].sort();
  const detections = [];
  for (const project of catalog.project_types) {
    const evidence = [];
    let score = 0;
    for (const signal of project.signals) {
      const matches = files.filter((file) => signalMatches(file, signal));
      if (matches.length) {
        score += signal.weight;
        evidence.push(...matches.map((file) => ({file, signal: signal.path ?? signal.prefix ?? signal.glob, weight: signal.weight})));
      }
    }
    if (score >= project.threshold) {
      detections.push({
        label: project.id,
        confidence: Math.min(1, Number((score / (project.threshold + 2)).toFixed(2))),
        evidence
      });
    }
  }
  return detections;
}
