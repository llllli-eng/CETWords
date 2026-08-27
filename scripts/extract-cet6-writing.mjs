/** Phase16.6 · Run the pypdf text-layer audit without OCR. */

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const helper = join(here, "extract-cet6-writing.py");
const candidates = [
  process.env.PYTHON,
  process.platform === "win32"
    ? join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
    : null,
  "python",
  "python3",
].filter(Boolean);

function findPython() {
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["-c", "import pypdf"], { encoding: "utf8" });
    if (check.status === 0) return candidate;
  }
  throw new Error("Python with pypdf is required for the local CET6 Writing audit.");
}

const result = spawnSync(findPython(), [helper, ...process.argv.slice(2)], {
  cwd: join(here, ".."),
  encoding: "utf8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
