import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {detectProjects} from "./detection.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const reviewCatalog = JSON.parse(fs.readFileSync(path.resolve(here, "..", "..", "references", "review-catalog.json"), "utf8"));

const highRiskTerms = new Set(["security", "privacy", "data", "data_integrity", "reliability", "compliance"]);
const combinedModeOrder = ["normies", "regulars", "experts", "well-actually"];

export function routeReviewRequest(intent) {
  const text = intent.toLowerCase();
  const selected = new Set();
  for (const mode of combinedModeOrder) if (text.includes(mode)) selected.add(mode);
  if (/launch|codebase|security|performance|audit/.test(text)) selected.add("experts");
  if (/first[- ]impression|visitors?.*understand|understand.*homepage/.test(text)) selected.add("normies");
  if (/complete.*(checkout|signup|flow)|checkout|task[- ]flow|key flows/.test(text)) selected.add("regulars");
  if (/nitpick|typography|polish|grammar/.test(text)) selected.add("well-actually");
  return combinedModeOrder.filter((mode) => selected.has(mode));
}

function laneScore(lane, labels, risks, userGoal) {
  const projectMatches = lane.projects.filter((item) => labels.has(item)).length;
  const riskText = `${risks.join(" ")} ${userGoal}`.toLowerCase();
  const riskMatches = lane.risks.filter((risk) => riskText.includes(risk.toLowerCase())).length;
  const specificity = projectMatches ? 10 / lane.projects.length : 0;
  return projectMatches * 10 + riskMatches * 20 + specificity + (lane.id === "TEST" ? 5 : 0);
}

function requestedSettings(lane) {
  const tier = reviewCatalog.model_tiers.find(({id}) => id === lane.tier);
  return {
    tier: tier.id,
    requested_model: tier.preferred_model,
    requested_reasoning_effort: tier.reasoning_effort,
    actual_model: null,
    actual_reasoning_effort: null
  };
}

export function createDossier({files = [], scope = null, changeContext = null, testCommands = [], exclusions = [], riskAssignments = {}} = {}) {
  const detections = detectProjects(files);
  return {
    scope,
    project_labels: detections,
    change_context: changeContext,
    risk_signals: [],
    important_files: [...new Set(files)].sort().slice(0, 20),
    test_commands: [...new Set(testCommands)],
    exclusions: [...new Set(exclusions)],
    risk_assignments: riskAssignments
  };
}

export function buildLaneBriefs(plan, dossier) {
  return plan.lanes.map((selected) => {
    const lane = reviewCatalog.lanes.find(({id}) => id === selected.id);
    const explicitOwnership = dossier.risk_assignments[selected.id];
    const ownedRisks = explicitOwnership?.owned ?? lane.risks;
    const adjacentOwnership = Object.entries(dossier.risk_assignments)
      .filter(([id]) => id !== selected.id)
      .flatMap(([id, assignment]) => assignment.owned.map((risk) => ({lane: id, risk})));
    return {
      lane: selected.id,
      responsibility: ownedRisks,
      adjacent_lane_ownership: adjacentOwnership,
      files: explicitOwnership?.files ?? dossier.important_files,
      tests: dossier.test_commands,
      exclusions: [...dossier.exclusions, ...(explicitOwnership?.exclusions ?? [])]
    };
  });
}

export function planExpertDispatch(options = {}) {
  const {
    files = [],
    userGoal = "",
    risks = [],
    requestedLaneCount = null,
    explicitHighAssurance = false,
    ambiguousScope = false,
    highRiskNotVerified = false,
    materialConflict = false,
    uncoveredRisk = null,
    privateAccess = false,
    externalAccess = false,
    mutation = false,
    materialScopeExpansion = false
  } = options;
  const detections = detectProjects(files);
  const labels = new Set(detections.map(({label}) => label));
  const effectiveRisks = [...new Set([...risks, ...(uncoveredRisk ? [uncoveredRisk] : [])])];
  const scored = reviewCatalog.lanes
    .map((lane) => ({lane, score: laneScore(lane, labels, effectiveRisks, userGoal)}))
    .filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score || a.lane.id.localeCompare(b.lane.id));
  const fallback = ["TEST", "ARCH", "DX"].map((id) => ({lane: reviewCatalog.lanes.find((lane) => lane.id === id), score: 1}));
  const candidates = scored.length >= 3 ? scored : [...scored, ...fallback.filter(({lane}) => !scored.some((item) => item.lane.id === lane.id))];
  const initial = candidates.slice(0, reviewCatalog.dispatch.ordinary_initial_lanes);

  const escalationReasons = [];
  const hasHighRisk = effectiveRisks.some((risk) => highRiskTerms.has(risk));
  if (hasHighRisk) escalationReasons.push("high_risk");
  if (ambiguousScope) escalationReasons.push("ambiguous_scope");
  if (highRiskNotVerified) escalationReasons.push("high_risk_not_verified");
  if (materialConflict) escalationReasons.push("material_conflict");
  if (uncoveredRisk) escalationReasons.push("uncovered_risk");
  if (explicitHighAssurance) escalationReasons.push("explicit_high_assurance");

  const selected = [...initial];
  if (escalationReasons.length) {
    for (const item of candidates.slice(initial.length)) {
      if (selected.length >= reviewCatalog.dispatch.auto_dispatch_limit) break;
      selected.push(item);
      if (selected.length >= 4 && !explicitHighAssurance && !materialConflict && !highRiskNotVerified) break;
    }
  }

  const approvalReasons = [];
  if ((requestedLaneCount ?? selected.length) >= reviewCatalog.dispatch.approval_lane_count) approvalReasons.push("six_or_more_lanes");
  if (privateAccess || externalAccess) approvalReasons.push("private_or_external_access");
  if (mutation) approvalReasons.push("external_state_change");
  if (materialScopeExpansion) approvalReasons.push("material_scope_expansion");

  const lanes = selected.map(({lane, score}) => ({id: lane.id, name: lane.name, score: Number(score.toFixed(2)), safety_class: lane.safety_class, model: requestedSettings(lane)}));
  return {
    project_labels: detections,
    initial_lane_count: initial.length,
    lanes,
    escalation_reasons: escalationReasons,
    approval: {required: approvalReasons.length > 0, reasons: approvalReasons},
    uncertainty: detections.length ? null : "Project signals were insufficient; generic lanes selected."
  };
}
