/**
 * Phase C: export prefs persistence — field contract + brief cache shape.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const api = readFileSync(
  join(root, "src/app/api/travels/[id]/export-prefs/route.ts"),
  "utf8"
);
const client = readFileSync(join(root, "src/lib/export-prefs.ts"), "utf8");

for (const field of [
  "exportBrief",
  "exportBriefCache",
  "htmlTemplateId",
  "htmlThemePackId",
  "htmlTypePackId",
  "reelPresetId",
  "pdfPresetId",
]) {
  assert.ok(schema.includes(`${field} String?`), `schema missing ${field}`);
  assert.ok(api.includes(field), `api missing ${field}`);
  assert.ok(client.includes(field), `client missing ${field}`);
}

assert.ok(api.includes("export async function GET"));
assert.ok(api.includes("export async function PATCH"));
assert.ok(client.includes("fetchTravelExportPrefs"));
assert.ok(client.includes("saveTravelExportPrefs"));

for (const panel of [
  "ExportHtmlPanel.tsx",
  "ExportPdfPanel.tsx",
  "ExportReelPanel.tsx",
]) {
  const src = readFileSync(join(root, "src/components", panel), "utf8");
  assert.ok(
    src.includes("fetchTravelExportPrefs"),
    `${panel} should load prefs`
  );
  assert.ok(
    src.includes("saveTravelExportPrefs"),
    `${panel} should save prefs`
  );
}

console.log("test-export-prefs: ok");
