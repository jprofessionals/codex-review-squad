#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {formatDiagnostics, validateLegacyReport, validateReport} from "./lib/report-validation.mjs";

export {formatDiagnostics, validateLegacyReport, validateReport};

function usage() {
  return "Usage: node validate-report.mjs [--legacy] <report.json>";
}

if (process.argv[1] && path.basename(process.argv[1]) === "validate-report.mjs" && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage());
    process.exit(0);
  }
  const legacy = args[0] === "--legacy";
  const file = args[legacy ? 1 : 0];
  if (!file || args.length !== (legacy ? 2 : 1)) {
    console.error(usage());
    process.exit(2);
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`REPORT_READ_ERROR ${file}: ${error.message}`);
    process.exit(2);
  }

  const result = legacy ? validateLegacyReport(report) : validateReport(report);
  if (!result.valid) {
    console.error(formatDiagnostics(result.diagnostics));
    process.exit(1);
  }

  console.log(`Report valid: schema ${report.schema_version} (${file})`);
}
