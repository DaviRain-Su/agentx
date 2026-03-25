import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const vendorRoot = path.join(repoRoot, "vendor/pi-worker");

const workspaces = ["pi-tui-worker", "pi-coding-agent-worker", "pi-worker"];

function hasDist(workspace) {
  const distPath = path.join(vendorRoot, "packages", workspace, "dist");
  return existsSync(distPath);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

const missing = workspaces.filter((workspace) => !hasDist(workspace));

if (missing.length > 0) {
  const bunExists = run("bun", ["--version"], vendorRoot);
  if (bunExists) {
    console.log("[prepare:pi-worker] Missing dist detected, bootstrapping vendor/pi-worker via bun...");
    run("bun", ["install", "--linker", "hoisted"], vendorRoot);
    for (const workspace of ["pi-worker", "pi-tui-worker", "pi-coding-agent-worker"]) {
      if (!hasDist(workspace)) {
        run("bun", ["--cwd", path.join("packages", workspace), "run", "build"], vendorRoot);
      }
    }
  }
}

for (const workspace of workspaces) {
  const distPath = path.join(vendorRoot, "packages", workspace, "dist");
  if (!existsSync(distPath)) {
    console.warn(
      `[prepare:pi-worker] Missing build output: ${distPath}\n` +
      `Run in ${vendorRoot} with bun install --linker hoisted and build ${workspace}.`
    );
  }
}
