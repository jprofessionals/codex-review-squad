import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {collectBundledDependencies, runtimeDependencyManifest} from "../scripts/lib/runtime-dependencies.mjs";
import {loadCatalogState, validateRepositoryCatalogState} from "../scripts/lib/catalog-validation.mjs";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(testsRoot, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("release and generator versions are exactly 0.3.3 without a cachebuster", () => {
  const manifest = readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  assert.equal(manifest.version, "0.3.3");
  assert.equal(packageJson.version, "0.3.3");
  assert(!manifest.version.includes("+"));
  for (const file of fs.readdirSync(path.join(testsRoot, "fixtures", "reports", "v2"))) {
    const report = readJson(path.join(testsRoot, "fixtures", "reports", "v2", file));
    assert.equal(report.generator.version, "0.3.3", file);
  }
});

test("bundled runtime has exact development-only build dependencies", () => {
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  assert.equal(packageJson.dependencies, undefined);
  assert.deepEqual(packageJson.devDependencies, {ajv: "8.20.0", "ajv-formats": "3.0.1", esbuild: "0.28.1", yaml: "2.9.0"});
  for (const version of Object.values(packageJson.devDependencies)) assert.match(version, /^\d+\.\d+\.\d+$/);
});

test("bundled runtime inputs have exact distributed notices and license texts", async () => {
  const result = await build({
    entryPoints: {"review-runtime": path.join(pluginRoot, "scripts", "review-runtime.mjs")},
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "bundle",
    metafile: true,
    write: false,
    logLevel: "silent"
  });
  const dependencies = collectBundledDependencies({metafile: result.metafile, repoRoot});
  const manifest = runtimeDependencyManifest(dependencies);
  assert.deepEqual(manifest, readJson(path.join(pluginRoot, "scripts", "runtime", "runtime-dependencies.json")));
  assert.deepEqual(manifest.packages.map(({name, version, license}) => ({name, version, license})), [
    {name: "ajv", version: "8.20.0", license: "MIT"},
    {name: "ajv-formats", version: "3.0.1", license: "MIT"},
    {name: "fast-deep-equal", version: "3.1.3", license: "MIT"},
    {name: "fast-uri", version: "3.1.4", license: "BSD-3-Clause"},
    {name: "json-schema-traverse", version: "1.0.0", license: "MIT"},
    {name: "yaml", version: "2.9.0", license: "ISC"}
  ]);
  const notices = fs.readFileSync(path.join(pluginRoot, "THIRD_PARTY_NOTICES.md"), "utf8");
  assert(!notices.includes("license comments are retained"));
  for (const dependency of dependencies) {
    assert(fs.readFileSync(path.join(pluginRoot, dependency.license_file)).equals(fs.readFileSync(dependency.license_source)), dependency.name);
    assert(notices.includes(`- ${dependency.name} ${dependency.version} — ${dependency.license} — \`${dependency.license_file}\``));
  }
  assert(notices.includes("esbuild 0.28.1 — MIT"));
  assert.match(notices, /not included in the\s+installed runtime bundle/);
});

test("repository integration still rejects missing README and marketplace metadata", () => {
  const state = loadCatalogState(pluginRoot, repoRoot);
  assert.deepEqual(validateRepositoryCatalogState(state), []);
  const missingReadmeMode = {...state, readme: state.readme.replaceAll("review-squad:normies", "removed-mode")};
  assert(validateRepositoryCatalogState(missingReadmeMode).some((error) => error === "README does not document normies"));
  const missingMarketplace = {...state, marketplace: {...state.marketplace, plugins: []}};
  assert(validateRepositoryCatalogState(missingMarketplace).includes("marketplace is missing a review-squad plugin entry"));
  const inconsistentMarketplace = structuredClone(state);
  inconsistentMarketplace.marketplace.plugins.find(({name}) => name === "review-squad").source.path = "./wrong";
  assert(validateRepositoryCatalogState(inconsistentMarketplace).includes('marketplace review-squad source.path must be "./plugins/review-squad"'));
});

test("README matches the released report, dispatch, BMAD, browser, and artifact contracts", () => {
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  for (const expected of [
    'schema_version: "2.0"',
    "JSON is always the source of truth",
    "starts with three risk-selected lanes",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "_bmad/_config/manifest.yaml",
    ".bmad-core/install-manifest.yaml",
    "@playwright/mcp@0.0.78",
    "storage,config",
    "installed plugin root",
    "fresh reasoning context",
    "externally visible final action",
    "inline_only",
    "codex plugin list",
    "Git-backed marketplace",
    "codex plugin add --json",
    "installedPath",
    "credential-free",
    "closed-world",
    "non-authoritative diagnostics",
    "`--ignore-user-config`"
  ]) assert(readme.includes(expected), `README missing ${expected}`);
  assert.match(readme, /does\s+not use `--ignore-user-config`/);
  assert(!readme.includes("provenance session ignores user config"));
  const localSection = readme.indexOf("For a local-filesystem marketplace");
  const gitSection = readme.indexOf("For a Git-backed marketplace");
  const upgrade = readme.indexOf("codex plugin marketplace upgrade", gitSection);
  assert(localSection >= 0 && gitSection > localSection && upgrade > gitSection);
});

test("released guidance contains no stale 0.2.3 contract", () => {
  const files = [path.join(repoRoot, "README.md"), path.join(pluginRoot, ".mcp.json")];
  for (const directory of ["skills", "references"]) {
    const walk = (root) => {
      for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
        const file = path.join(root, entry.name);
        if (entry.isDirectory()) {
          if (file.includes(`${path.sep}references${path.sep}schemas`)) continue;
          walk(file);
        } else if (/\.(md|json)$/.test(entry.name)) files.push(file);
      }
    };
    walk(path.join(pluginRoot, directory));
  }
  const production = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  for (const stale of ['schema_version: "1.1"', "BMAD Decision Section", "fork_context", "agent_type", "@latest", "4-8", "session is shared", "Always write the paired"]) {
    assert(!production.includes(stale), `stale production contract: ${stale}`);
  }
});

test("public scripts advertise help and invalid-invocation usage", () => {
  const scripts = ["validate-plugin.mjs", "validate-report.mjs", "render-report.mjs", "migrate-report.mjs", "validate-catalog.mjs", "check-eval-corpus.mjs", "browser-policy-check.mjs", "detect-projects.mjs", "build-runtime.mjs", "verify-real-browser.mjs", "verify-installed-plugin.mjs", "run-evaluation.mjs"];
  for (const script of scripts) {
    const file = path.join(pluginRoot, "scripts", script);
    const source = fs.readFileSync(file, "utf8");
    assert(source.includes("--help"), `${script}: missing --help handling`);
    assert(source.includes("Usage:"), `${script}: missing usage text`);
    assert(source.includes("process.exit(2)"), `${script}: missing invalid-invocation exit`);
  }
});

test("installed-plugin verifier guards identity, evidence, and cleanup", () => {
  const source = [
    path.join(pluginRoot, "scripts", "verify-installed-plugin.mjs"),
    path.join(pluginRoot, "scripts", "lib", "installed-provenance.mjs")
  ].map((file) => fs.readFileSync(file, "utf8")).join("\n");
  for (const expected of [
    "crypto.randomBytes",
    "0.3.3+codex.rg07-",
    "plugin\", \"list\", \"--json",
    "marketplace\", \"list\", \"--json",
    "--ephemeral", "--json", "turn.completed",
    "session.jsonl", "session-final.json", "pre-state.json", "post-state.json",
    "source_locator", "installedPath", "verifyInstallationReceipt", "marketplace/source evidence only",
    "finally", "manual_recovery_commands", "pre_existing_0_2_3_unchanged"
  ]) assert(source.includes(expected), `installed verifier missing ${expected}`);
  assert(!source.includes("codex-review-squad-local-rg07"));
  assert(!source.includes("installedRoot = path.resolve(installed.source.path)"));
});
