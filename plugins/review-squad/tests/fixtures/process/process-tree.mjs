import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawn} from "node:child_process";

process.on("SIGTERM", () => {});

if (process.argv[2] === "grandchild") {
  setInterval(() => {}, 1_000);
} else {
  const readyPath = path.resolve(process.argv[2]);
  const grandchild = spawn(process.execPath, [new URL(import.meta.url).pathname, "grandchild"], {
    stdio: "ignore",
    detached: false
  });
  const marker = {marker: "ready", child_pid: process.pid, grandchild_pid: grandchild.pid};
  fs.writeFileSync(readyPath, `${JSON.stringify(marker)}\n`);
  process.stdout.write(`READY ${JSON.stringify(marker)}\n`);
  setInterval(() => {}, 1_000);
}
