#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {collectBundledDependencies, renderThirdPartyNotices, runtimeDependencyManifest} from "./lib/runtime-dependencies.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptsRoot, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");
const runtimeRoot = path.join(scriptsRoot, "runtime");
const licensesRoot = path.join(pluginRoot, "licenses");
const noticesPath = path.join(pluginRoot, "THIRD_PARTY_NOTICES.md");
const entries = {"review-runtime": path.join(scriptsRoot, "review-runtime.mjs")};

function usage() {
  return "Usage: node build-runtime.mjs [--check]";
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(usage());
  process.exit(0);
}
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  console.error(usage());
  process.exit(2);
}

const check = args[0] === "--check";
const outputRoot = check ? fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-runtime-")) : runtimeRoot;

try {
  if (!check) fs.rmSync(runtimeRoot, {recursive: true, force: true});
  const buildResult = await build({
    entryPoints: entries,
    outdir: outputRoot,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outExtension: {".js": ".mjs"},
    banner: {js: 'import {createRequire as __createRequire} from "node:module"; const require = __createRequire(import.meta.url);'},
    legalComments: "eof",
    sourcemap: false,
    packages: "bundle",
    logLevel: "silent",
    metafile: true
  });

  const dependencies = collectBundledDependencies({metafile: buildResult.metafile, repoRoot});
  const manifest = runtimeDependencyManifest(dependencies);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const noticesText = renderThirdPartyNotices(manifest, {buildToolVersion: packageJson.devDependencies.esbuild});

  if (check) {
    for (const name of Object.keys(entries)) {
      const file = `${name}.mjs`;
      const expected = path.join(runtimeRoot, file);
      const actual = path.join(outputRoot, file);
      if (!fs.existsSync(expected) || !fs.readFileSync(expected).equals(fs.readFileSync(actual))) {
        console.error(`Runtime bundle is stale: scripts/runtime/${file}`);
        process.exitCode = 1;
      }
    }
    const committedManifest = path.join(runtimeRoot, "runtime-dependencies.json");
    if (!fs.existsSync(committedManifest) || fs.readFileSync(committedManifest, "utf8") !== manifestText) {
      console.error("Runtime dependency manifest is stale: scripts/runtime/runtime-dependencies.json");
      process.exitCode = 1;
    }
    if (!fs.existsSync(noticesPath) || fs.readFileSync(noticesPath, "utf8") !== noticesText) {
      console.error("Third-party notices are stale: THIRD_PARTY_NOTICES.md");
      process.exitCode = 1;
    }
    const expectedLicenses = new Set();
    for (const dependency of dependencies) {
      const committed = path.join(pluginRoot, dependency.license_file);
      expectedLicenses.add(path.basename(committed));
      if (!fs.existsSync(committed) || !fs.readFileSync(committed).equals(fs.readFileSync(dependency.license_source))) {
        console.error(`Third-party license is missing or stale: ${dependency.license_file}`);
        process.exitCode = 1;
      }
    }
    const observedLicenses = fs.existsSync(licensesRoot) ? new Set(fs.readdirSync(licensesRoot)) : new Set();
    if (JSON.stringify([...observedLicenses].sort()) !== JSON.stringify([...expectedLicenses].sort())) {
      console.error("Distributed third-party license file set does not match bundled packages");
      process.exitCode = 1;
    }
    if (!process.exitCode) console.log("Runtime bundles are current and reproducible.");
  } else {
    fs.writeFileSync(path.join(runtimeRoot, "runtime-dependencies.json"), manifestText);
    fs.rmSync(licensesRoot, {recursive: true, force: true});
    fs.mkdirSync(licensesRoot, {recursive: true});
    for (const dependency of dependencies) fs.copyFileSync(dependency.license_source, path.join(pluginRoot, dependency.license_file));
    fs.writeFileSync(noticesPath, noticesText);
    console.log("Built the standalone Review Squad runtime bundle.");
  }
} finally {
  if (check) fs.rmSync(outputRoot, {recursive: true, force: true});
}
