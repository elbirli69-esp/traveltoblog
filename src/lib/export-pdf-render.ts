import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import type { PdfPageFormat } from "@/lib/export-pdf-types";

const execFileAsync = promisify(execFile);

function resolveWeasyPrint(): string[] {
  const candidates = [
    process.env.WEASYPRINT_BIN,
    "/usr/bin/weasyprint",
    path.join(process.env.HOME ?? "", ".local", "bin", "weasyprint"),
  ].filter((c): c is string => Boolean(c));
  return [...new Set(candidates)];
}

export async function probeWeasyPrint(): Promise<{ available: boolean; detail?: string }> {
  const errors: string[] = [];

  for (const bin of resolveWeasyPrint()) {
    try {
      await execFileAsync(bin, ["--version"], { timeout: 8000, env: process.env });
      return { available: true, detail: bin };
    } catch (err) {
      errors.push(`${bin}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  try {
    await execFileAsync(
      "python3",
      ["-c", "import weasyprint; print(weasyprint.__version__)"],
      { timeout: 8000, env: process.env }
    );
    return { available: true, detail: "python3+weasyprint" };
  } catch (err) {
    errors.push(`python3: ${err instanceof Error ? err.message : "failed"}`);
  }

  return { available: false, detail: errors.join("; ") };
}

export async function renderPdfToFile(
  htmlPath: string,
  pdfPath: string,
  format: PdfPageFormat
): Promise<void> {
  const scriptPath = path.join(process.cwd(), "scripts", "render-pdf.py");
  const errors: string[] = [];

  for (const bin of resolveWeasyPrint()) {
    try {
      await execFileAsync(bin, [htmlPath, pdfPath], {
        env: process.env,
        timeout: 600_000,
      });
      return;
    } catch (err) {
      errors.push(`${bin}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  try {
    await execFileAsync("python3", [scriptPath, htmlPath, pdfPath, "--format", format], {
      env: process.env,
      timeout: 600_000,
    });
    return;
  } catch (err) {
    errors.push(`python3: ${err instanceof Error ? err.message : "failed"}`);
  }

  throw new Error(`WeasyPrint no disponible (${errors.join("; ")})`);
}
