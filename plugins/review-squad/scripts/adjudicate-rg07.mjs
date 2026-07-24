#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {adjudicateRg07Evidence} from "./lib/rg07-adjudication.mjs";

const usage = "Usage: node adjudicate-rg07.mjs --source <absolute-directory> --output <new-directory> --expected-result-sha256 <sha256>";

function parseArgs(argv) {
  if (argv.length !== 6 || argv[0] !== "--source" || argv[2] !== "--output" || argv[4] !== "--expected-result-sha256") throw new Error(usage);
  const source = path.resolve(argv[1]);
  const output = path.resolve(argv[3]);
  if (!path.isAbsolute(argv[1]) || !/^[a-f0-9]{64}$/.test(argv[5])) throw new Error(usage);
  return {source, output, expectedResultSha256: argv[5]};
}

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
  if (fs.existsSync(parsed.output)) throw new Error("--output must not already exist");
  const sources = {
    original_result: path.join(parsed.source, "result.json"),
    session_final: path.join(parsed.source, "session-final.json"),
    session_jsonl: path.join(parsed.source, "session.jsonl")
  };
  const retained = {
    original_result: path.join(parsed.output, "original-result.json"),
    session_final: path.join(parsed.output, "session-final.json"),
    session_jsonl: path.join(parsed.output, "session.jsonl")
  };
  const bytes = {
    original_result: fs.readFileSync(sources.original_result),
    session_final: fs.readFileSync(sources.session_final),
    session_jsonl: fs.readFileSync(sources.session_jsonl)
  };
  const record = adjudicateRg07Evidence({
    originalResultBytes: bytes.original_result,
    sessionFinalBytes: bytes.session_final,
    sessionJsonlBytes: bytes.session_jsonl,
    expectedOriginalResultSha256: parsed.expectedResultSha256,
    originalPaths: sources,
    retainedPaths: Object.fromEntries(Object.entries(retained).map(([key, file]) => [key, path.relative(process.cwd(), file)]))
  });
  fs.mkdirSync(parsed.output, {recursive: false});
  for (const key of Object.keys(retained)) fs.copyFileSync(sources[key], retained[key]);
  fs.writeFileSync(path.join(parsed.output, "adjudication.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({status: "passed", output: parsed.output, verdict: record.verdict}, null, 2)}\n`);
} catch (error) {
  console.error(error.diagnostic ? JSON.stringify(error.diagnostic) : error.message);
  process.exitCode = 1;
}
