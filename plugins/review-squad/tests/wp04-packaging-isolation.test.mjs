import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, {after} from "node:test";
import {spawnSync} from "node:child_process";
import {pathToFileURL, fileURLToPath} from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const sourcePlugin = path.resolve(testsRoot, "..");
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "review-squad-installed-"));
const installedPlugin = path.join(isolatedRoot, "review-squad");
fs.cpSync(sourcePlugin, installedPlugin, {recursive: true});
after(() => fs.rmSync(isolatedRoot, {recursive: true, force: true}));

const load = (relative) => import(`${pathToFileURL(path.join(installedPlugin, relative)).href}?isolation=${Date.now()}`);
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(installedPlugin, relative), "utf8"));

test("README standalone copied layout validates without repository ancestors or node_modules", () => {
  for (const absent of ["README.md", path.join(".agents", "plugins", "marketplace.json"), "node_modules"]) {
    assert.equal(fs.existsSync(path.join(isolatedRoot, absent)), false, `unexpected standalone ancestor: ${absent}`);
  }
  const {NODE_TEST_CONTEXT: _ignored, ...env} = process.env;
  const result = spawnSync(process.execPath, ["review-squad/scripts/validate-plugin.mjs"], {cwd: isolatedRoot, env, encoding: "utf8", timeout: 30_000});
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("standalone copy contains every generated runtime dependency notice and license", () => {
  const manifest = readJson("scripts/runtime/runtime-dependencies.json");
  const notices = fs.readFileSync(path.join(installedPlugin, "THIRD_PARTY_NOTICES.md"), "utf8");
  assert.equal(manifest.generated_from, "esbuild metafile inputs");
  assert(manifest.packages.length > 0);
  for (const dependency of manifest.packages) {
    const license = path.join(installedPlugin, dependency.license_file);
    assert(fs.statSync(license).size > 0, dependency.license_file);
    assert(notices.includes(`- ${dependency.name} ${dependency.version} — ${dependency.license} — \`${dependency.license_file}\``));
  }
});

test("copied plugin runtime has no package-resolution dependency", async () => {
  assert.equal(fs.existsSync(path.join(isolatedRoot, "node_modules")), false);
  for (const file of fs.readdirSync(path.join(installedPlugin, "scripts", "runtime"))) {
    const source = fs.readFileSync(path.join(installedPlugin, "scripts", "runtime", file), "utf8");
    assert(!/from\s+["'](?:ajv|ajv-formats|yaml)(?:\/|["'])/.test(source), file);
  }

  const runtime = await load("scripts/runtime/review-runtime.mjs");

  const report = readJson("tests/fixtures/reports/v2/regulars-clean.json");
  assert.equal(runtime.validateReport(report).valid, true);
  assert.match(runtime.renderReport(report), /^# Review Squad: Regulars/);

  const legacy = readJson("tests/fixtures/reports/v1.1/valid-empty.json");
  assert.equal(runtime.migrateReport(legacy).schema_version, "2.0");

  assert.deepEqual(runtime.detectProjects(readJson("tests/fixtures/nested-project-files.json")).map(({label}) => label), ["web", "agent_plugin_prompt"]);
  assert.equal(runtime.detectBmad({"_bmad/_config/manifest.yaml": "version: 6\nmodules: [bmm]\n"}, {requested: true}).state, "active");
});

test("target scripts cannot shadow runtime resolved from the loaded plugin reference", async () => {
  const target = path.join(isolatedRoot, "review-target");
  const marker = path.join(target, "shadow-executed");
  fs.mkdirSync(path.join(target, "scripts", "runtime"), {recursive: true});
  fs.writeFileSync(path.join(target, "scripts", "runtime", "review-runtime.mjs"), `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "unsafe"); throw new Error("shadowed");\n`);

  const paths = await load("scripts/lib/runtime-paths.mjs");
  const reference = path.join(installedPlugin, "references", "report-formats.md");
  const resolved = paths.resolveRuntimeCommand(reference, "validate");
  assert.equal(resolved, path.join(installedPlugin, "scripts", "runtime", "review-runtime.mjs"));
  const runtime = await import(`${pathToFileURL(resolved).href}?shadow=${Date.now()}`);
  assert.equal(runtime.validateReport(readJson("tests/fixtures/reports/v2/regulars-clean.json")).valid, true);
  assert.equal(fs.existsSync(marker), false);
});
