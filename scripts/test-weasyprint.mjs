import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function probe() {
  try {
    await execFileAsync("weasyprint", ["--version"], { timeout: 8000 });
    return true;
  } catch {
    try {
      await execFileAsync("python3", [
        "-c",
        "import weasyprint; print(weasyprint.__version__)",
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

const ok = await probe();
assert.equal(typeof ok, "boolean");
if (!ok) {
  console.log("weasyprint probe: not installed (ok in CI without apt)");
} else {
  console.log("weasyprint probe: available");
}

console.log("weasyprint-check ok");
