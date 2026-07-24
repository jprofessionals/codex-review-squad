import fs from "node:fs";
import path from "node:path";

const commands = new Set(["detect", "migrate", "render", "validate"]);

export function resolveRuntimeCommand(referenceFile, command) {
  if (!commands.has(command)) throw new Error(`unknown plugin runtime command: ${command}`);
  const resolvedReference = fs.realpathSync(referenceFile);
  if (path.basename(path.dirname(resolvedReference)) !== "references") {
    throw new Error("runtime commands must be resolved from a loaded plugin reference file");
  }
  const pluginRoot = path.dirname(path.dirname(resolvedReference));
  const runtime = path.join(pluginRoot, "scripts", "runtime", "review-runtime.mjs");
  if (!fs.statSync(runtime).isFile()) throw new Error(`plugin runtime command is missing: ${runtime}`);
  return runtime;
}
