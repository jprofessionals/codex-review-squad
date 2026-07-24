#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {loadCatalogState, validateCatalogState} from "./lib/catalog-validation.mjs";

if (process.argv.length === 3 && process.argv[2] === "--help") {
  console.log("Usage: node validate-catalog.mjs");
  process.exit(0);
}
if (process.argv.length !== 2) {
  console.error("Usage: node validate-catalog.mjs");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const state = loadCatalogState(pluginRoot, path.resolve(pluginRoot, "..", ".."));
const errors = validateCatalogState(state);
if (errors.length) {
  console.error("Catalog validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Catalog valid: ${state.catalog.modes.length} modes, ${state.catalog.project_types.length} project types, ${state.catalog.lanes.length} lanes, ${state.catalog.model_tiers.length} model tiers.`);
