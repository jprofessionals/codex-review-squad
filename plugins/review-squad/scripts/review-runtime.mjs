#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {bmadExtensionFromDetection, detectBmad, detectProjects, matchesGlob} from "./lib/detection.mjs";
import {migrateReport} from "./migrate-report.mjs";
import {renderReport} from "./render-report.mjs";
import {formatDiagnostics, validateLegacyReport, validateReport} from "./lib/report-validation.mjs";

export {bmadExtensionFromDetection, detectBmad, detectProjects, formatDiagnostics, matchesGlob, migrateReport, renderReport, validateLegacyReport, validateReport};

function usage() {
  return "Usage: node review-runtime.mjs <validate|render|migrate|detect> [arguments]";
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`${label} ${file}: ${error.message}`);
    process.exit(2);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--help") {
    console.log(usage());
    process.exit(0);
  }
  if (!command) {
    console.error(usage());
    process.exit(2);
  }

  if (command === "validate") {
    const legacy = args[0] === "--legacy";
    const file = args[legacy ? 1 : 0];
    if (!file || args.length !== (legacy ? 2 : 1)) {
      console.error(`${usage()}\nvalidate: [--legacy] <report.json>`);
      process.exit(2);
    }
    const report = readJson(file, "REPORT_READ_ERROR");
    const result = legacy ? validateLegacyReport(report) : validateReport(report);
    if (!result.valid) {
      console.error(formatDiagnostics(result.diagnostics));
      process.exit(1);
    }
    console.log(`Report valid: schema ${report.schema_version} (${file})`);
  } else if (command === "render" || command === "migrate") {
    const outputIndex = args.indexOf("--output");
    const validArgs = args.length === 1 || (args.length === 3 && outputIndex === 1 && args[2]);
    if (!validArgs) {
      console.error(`${usage()}\n${command}: <input.json> [--output <output-file>]`);
      process.exit(2);
    }
    try {
      const report = readJson(args[0], "REPORT_READ_ERROR");
      const value = command === "render" ? renderReport(report) : `${JSON.stringify(migrateReport(report), null, 2)}\n`;
      if (outputIndex === 1) fs.writeFileSync(args[2], value);
      else process.stdout.write(value);
    } catch (error) {
      console.error(`${command.toUpperCase()}_ERROR: ${error.message}`);
      process.exit(1);
    }
  } else if (command === "detect") {
    if (args.length !== 1) {
      console.error(`${usage()}\ndetect: <files.json>`);
      process.exit(2);
    }
    const files = readJson(args[0], "DETECTION_INPUT_ERROR");
    if (!Array.isArray(files) || files.some((item) => typeof item !== "string")) {
      console.error("DETECTION_INPUT_ERROR: input must be a JSON array of repository-relative file paths");
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(detectProjects(files), null, 2)}\n`);
  } else {
    console.error(usage());
    process.exit(2);
  }
}
