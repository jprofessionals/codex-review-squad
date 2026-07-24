#!/usr/bin/env node
import process from "node:process";
import {policyResult, policyScenarios} from "./browser-contract.mjs";

const scenario = process.argv[2];
if (scenario === "--help" && process.argv.length === 3) {
  console.log(`Usage: node browser-policy-check.mjs <${Object.keys(policyScenarios).join("|")}>`);
  process.exit(0);
}
if (!scenario || !policyScenarios[scenario]) {
  console.error(`Usage: node browser-policy-check.mjs <${Object.keys(policyScenarios).join("|")}>`);
  process.exit(2);
}

process.stdout.write(`${JSON.stringify(policyResult(scenario))}\n`);
