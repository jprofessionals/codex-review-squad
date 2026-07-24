import fs from "node:fs";
import path from "node:path";

function findPackageRoot(inputFile, repoRoot) {
  let current = path.dirname(path.resolve(repoRoot, inputFile));
  while (current.startsWith(`${repoRoot}${path.sep}`)) {
    if (path.basename(path.dirname(current)) === "node_modules" && fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function licenseSource(packageRoot) {
  const candidates = fs.readdirSync(packageRoot).filter((name) => /^(license|copying)(\..*)?$/i.test(name)).sort();
  if (candidates.length !== 1) throw new Error(`Expected exactly one top-level license file in ${packageRoot}, found ${candidates.length}`);
  return path.join(packageRoot, candidates[0]);
}

const licenseName = (name, version) => `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.txt`;

export function collectBundledDependencies({metafile, repoRoot}) {
  const packages = new Map();
  for (const input of Object.keys(metafile.inputs).sort()) {
    if (!input.includes("node_modules")) continue;
    const packageRoot = findPackageRoot(input, repoRoot);
    if (!packageRoot) throw new Error(`Could not resolve package root for bundled input ${input}`);
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    if (!metadata.name || !metadata.version || !metadata.license) throw new Error(`Bundled package metadata is incomplete: ${packageRoot}`);
    const key = `${metadata.name}@${metadata.version}`;
    const existing = packages.get(key) ?? {
      name: metadata.name,
      version: metadata.version,
      license: metadata.license,
      license_file: `licenses/${licenseName(metadata.name, metadata.version)}`,
      license_source: licenseSource(packageRoot),
      inputs: []
    };
    existing.inputs.push(path.relative(packageRoot, path.resolve(repoRoot, input)).split(path.sep).join("/"));
    packages.set(key, existing);
  }
  return [...packages.values()].sort((left, right) => left.name.localeCompare(right.name)).map((item) => ({...item, inputs: [...new Set(item.inputs)].sort()}));
}

export function runtimeDependencyManifest(dependencies) {
  return {
    schema_version: "1.0",
    generated_from: "esbuild metafile inputs",
    packages: dependencies.map(({license_source, ...item}) => item)
  };
}

export function renderThirdPartyNotices(manifest, {buildToolVersion}) {
  const distributed = manifest.packages.map((item) => `- ${item.name} ${item.version} — ${item.license} — \`${item.license_file}\``).join("\n");
  return `# Third-party notices

The standalone runtime in \`scripts/runtime/review-runtime.mjs\` contains code
from the packages below. This list and
\`scripts/runtime/runtime-dependencies.json\` are generated deterministically
from the esbuild metafile input set. Each referenced file contains the complete
license and copyright text distributed with that exact package version.

## Distributed in the runtime bundle

${distributed}

## Build-time only

- esbuild ${buildToolVersion} — MIT. esbuild generates the committed runtime,
  but esbuild package code and its platform binary are not included in the
  installed runtime bundle.

All dependency versions are exact development pins in the marketplace
repository. The installed plugin does not require ancestor \`node_modules\`.
`;
}
