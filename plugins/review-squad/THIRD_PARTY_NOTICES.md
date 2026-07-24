# Third-party notices

The standalone runtime in `scripts/runtime/review-runtime.mjs` contains code
from the packages below. This list and
`scripts/runtime/runtime-dependencies.json` are generated deterministically
from the esbuild metafile input set. Each referenced file contains the complete
license and copyright text distributed with that exact package version.

## Distributed in the runtime bundle

- ajv 8.20.0 — MIT — `licenses/ajv-8.20.0.txt`
- ajv-formats 3.0.1 — MIT — `licenses/ajv-formats-3.0.1.txt`
- fast-deep-equal 3.1.3 — MIT — `licenses/fast-deep-equal-3.1.3.txt`
- fast-uri 3.1.4 — BSD-3-Clause — `licenses/fast-uri-3.1.4.txt`
- json-schema-traverse 1.0.0 — MIT — `licenses/json-schema-traverse-1.0.0.txt`
- yaml 2.9.0 — ISC — `licenses/yaml-2.9.0.txt`

## Build-time only

- esbuild 0.28.1 — MIT. esbuild generates the committed runtime,
  but esbuild package code and its platform binary are not included in the
  installed runtime bundle.

All dependency versions are exact development pins in the marketplace
repository. The installed plugin does not require ancestor `node_modules`.
