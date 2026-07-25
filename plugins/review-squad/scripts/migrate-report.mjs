#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {formatDiagnostics, validateLegacyReport, validateReport} from "./lib/report-validation.mjs";

function meaningful(value) {
  return typeof value === "string" && value.trim() && !/^none\.?$/i.test(value.trim());
}

export function migrateReport(input) {
  if (input?.schema_version === "2.0") {
    const validation = validateReport(input);
    if (!validation.valid) throw new Error(formatDiagnostics(validation.diagnostics));
    return structuredClone(input);
  }

  const legacy = validateLegacyReport(input);
  if (!legacy.valid) throw new Error(formatDiagnostics(legacy.diagnostics));

  const bmadDecisions = new Map();
  for (const item of input.decision_summary.recommended_bmad_commands) {
    bmadDecisions.set(item.finding_id, {finding_id: item.finding_id, command: item.command, reason: item.reason, recommended_resolution: item.recommended_resolution ?? null});
  }

  const findings = input.findings.map((finding) => {
    if (meaningful(finding.bmad.recommended_command)) {
      bmadDecisions.set(finding.id, {
        finding_id: finding.id,
        command: finding.bmad.recommended_command,
        reason: finding.bmad.command_reason,
        recommended_resolution: finding.human_gate_summary.recommended_resolution ?? null
      });
    }
    const needsDecision = finding.workflow.decision_required || Object.values(finding.decision_flags).some(Boolean);
    return {
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
      source: finding.source,
      suggested_fix: finding.suggested_fix,
      ...(finding.impact ? {impact: finding.impact} : {}),
      ...(needsDecision ? {decision: {
        owner: "operator",
        question: finding.human_gate_summary.decision_needed,
        consequence: finding.human_gate_summary.consequence_if_ignored,
        recommendation: finding.human_gate_summary.recommended_resolution
      }} : {}),
      ...(finding.affected_files.length ? {affected_files: finding.affected_files} : {})
    };
  });

  const report = {
    schema_version: "2.0",
    report_id: input.report_id,
    mode: input.mode,
    generated_at: input.generated_at,
    generator: {...input.generator, version: "0.3.1"},
    target: {kind: input.target.kind, path: input.target.path ?? null, url: input.target.url ?? null, name: input.target.name ?? null},
    review_context: input.review_context,
    summary: input.summary,
    findings,
    not_verified: input.not_verified,
    mode_data: input.mode_data,
    sources: input.sources,
    artifacts: {
      status: "written",
      stem: input.artifacts.stem,
      json_path: input.artifacts.json_path,
      markdown_path: input.artifacts.markdown_path
    },
    ...(bmadDecisions.size ? {extensions: {bmad: {schema_version: "1.0", decisions: [...bmadDecisions.values()]}}} : {})
  };

  const validation = validateReport(report);
  if (!validation.valid) throw new Error(`MIGRATION_OUTPUT_INVALID\n${formatDiagnostics(validation.diagnostics)}`);
  return report;
}

function usage() {
  return "Usage: node migrate-report.mjs <legacy-or-v2.json> [--output <report.json>]";
}

if (process.argv[1] && path.basename(process.argv[1]) === "migrate-report.mjs" && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage());
    process.exit(0);
  }
  const valid = (args.length === 1 && !args[0].startsWith("-")) || (args.length === 3 && !args[0].startsWith("-") && args[1] === "--output" && !args[2].startsWith("-"));
  if (!valid) {
    console.error(usage());
    process.exit(2);
  }
  try {
    const migrated = migrateReport(JSON.parse(fs.readFileSync(args[0], "utf8")));
    const output = `${JSON.stringify(migrated, null, 2)}\n`;
    if (args[2]) fs.writeFileSync(args[2], output);
    else process.stdout.write(output);
  } catch (error) {
    console.error(`MIGRATION_ERROR: ${error.message}`);
    process.exit(1);
  }
}
