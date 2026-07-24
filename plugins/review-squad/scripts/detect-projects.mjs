#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {bmadExtensionFromDetection, detectBmad, detectProjects, matchesGlob} from "./lib/detection.mjs";

export {bmadExtensionFromDetection, detectBmad, detectProjects, matchesGlob};

function usage() {
  return "Usage: node detect-projects.mjs <files.json>";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage());
    process.exit(0);
  }
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error(usage());
    process.exit(2);
  }
  try {
    const files = JSON.parse(fs.readFileSync(args[0], "utf8"));
    if (!Array.isArray(files) || files.some((item) => typeof item !== "string")) {
      throw new Error("input must be a JSON array of repository-relative file paths");
    }
    process.stdout.write(`${JSON.stringify(detectProjects(files), null, 2)}\n`);
  } catch (error) {
    console.error(`DETECTION_INPUT_ERROR ${args[0]}: ${error.message}`);
    process.exit(1);
  }
}
