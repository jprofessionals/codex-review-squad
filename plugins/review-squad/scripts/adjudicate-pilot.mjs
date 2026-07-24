#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {adjudicatePilotEvidence} from "./lib/pilot-adjudication.mjs";

const usage = "Usage: node adjudicate-pilot.mjs --source <absolute-pilot-directory> --output <new-directory>";

try {
  const argv = process.argv.slice(2);
  if (argv.length !== 4 || argv[0] !== "--source" || argv[2] !== "--output" || !path.isAbsolute(argv[1])) throw new Error(usage);
  const source = path.resolve(argv[1]);
  const output = path.resolve(argv[3]);
  if (fs.existsSync(output)) throw new Error("--output must not already exist");
  const callRoot = path.join(source, "raw", "pilot-v0.3.0-backend-seeded");
  const sources = {
    original_result: path.join(source, "result.json"),
    session_jsonl: path.join(callRoot, "events.jsonl"),
    final_response: path.join(callRoot, "final.json"),
    delegation_events: path.join(callRoot, "delegation-events.json"),
    effective_argv: path.join(callRoot, "effective-argv.json"),
    prompt: path.join(callRoot, "prompt.txt"),
    input_manifest: path.join(callRoot, "input-manifest.json")
  };
  const retained = Object.fromEntries(Object.keys(sources).map((key) => [key, path.join(output, `${key.replaceAll("_", "-")}${key === "session_jsonl" ? ".jsonl" : key === "prompt" ? ".txt" : ".json"}`)]));
  const artifacts = Object.fromEntries(Object.entries(sources).map(([key, file]) => [key, fs.readFileSync(file)]));
  const record = adjudicatePilotEvidence({
    artifacts,
    originalPaths: sources,
    retainedPaths: Object.fromEntries(Object.entries(retained).map(([key, file]) => [key, path.relative(process.cwd(), file)]))
  });
  fs.mkdirSync(output, {recursive: false});
  for (const key of Object.keys(retained)) fs.copyFileSync(sources[key], retained[key]);
  fs.writeFileSync(path.join(output, "adjudication.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({status: record.verdict, output}, null, 2)}\n`);
} catch (error) {
  console.error(error.diagnostic ? JSON.stringify(error.diagnostic) : error.message);
  process.exitCode = 1;
}
