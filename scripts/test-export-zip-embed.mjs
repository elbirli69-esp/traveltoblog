import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

const { buildExportZip } = await import("../src/lib/export-html.ts");

const travelId = "zip-embed-test";
const uploadRel = path.join("uploads", travelId);
const uploadDir = path.join(process.cwd(), "public", uploadRel);
mkdirSync(uploadDir, { recursive: true });

const photoName = "sample.jpg";
const photoUrl = `/${uploadRel}/${photoName}`.replaceAll("\\", "/");
const photoPath = path.join(uploadDir, photoName);

const img = await sharp({
  create: { width: 640, height: 480, channels: 3, background: { r: 40, g: 120, b: 200 } },
}).jpeg().toBuffer();
writeFileSync(photoPath, img);

const outDir = "/tmp/ttb-zip-embed-test";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const zipBuf = await buildExportZip({
  travel: {
    id: travelId,
    title: "Prueba ZIP embed",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-03"),
    journalMarkdown: "# Día 1\n\nHola viaje.\n",
    travelType: "INTERNATIONAL",
  },
  users: [{ id: "u1", alias: "Ada", createdAt: new Date(), updatedAt: new Date() }],
  photos: [
    {
      id: "p1",
      url: photoUrl,
      localPath: "photos/001.webp",
      thumbPath: "photos/001-thumb.webp",
      latitude: 50.06,
      longitude: 19.94,
      mediaType: "IMAGE",
      videoPath: null,
      durationMs: null,
      exportSourceUrl: photoUrl,
      exifDateTime: new Date("2024-06-02T10:00:00Z"),
      alias: "Ada",
      isTransportStart: false,
      isTransportEnd: false,
      highlightScore: 8,
    },
  ],
  places: [
    {
      id: "pl1",
      name: "Plaza",
      type: "MUSEUM",
      latitude: 50.061,
      longitude: 19.937,
      comment: "Nota",
      alias: "Ada",
      visitedAt: new Date("2024-06-02"),
      highlightScore: 9,
    },
  ],
  notes: [],
  gpsTracks: [],
  template: "magazine",
  typology: "INTERNATIONAL",
});

writeFileSync(path.join(outDir, "out.zip"), zipBuf);
const zip = await JSZip.loadAsync(zipBuf);
const html = await zip.file("index.html").async("string");
writeFileSync(path.join(outDir, "index.html"), html);

assert.match(html, /window\.__EXPORT_PHOTOS__\s*=/, "ZIP index.html must embed photo registry");
assert.match(html, /photos\/001-thumb\.webp/, "registry should reference thumb key");
assert.match(
  html,
  /data:image\/webp;base64,/,
  "registry must include embedded webp data URLs"
);

const registryMatch = html.match(/window\.__EXPORT_PHOTOS__=(\{[\s\S]*?\});<\/script>/);
assert.ok(registryMatch, "could not parse __EXPORT_PHOTOS__ JSON");
const registry = JSON.parse(registryMatch[1]);
assert.ok(registry["photos/001.webp"], "missing display photo in registry");
assert.ok(registry["photos/001-thumb.webp"], "missing thumb in registry");

const names = Object.keys(zip.files);
assert.ok(names.includes("photos/001.webp"), "loose photo still packed");
assert.ok(names.includes("photos/001-thumb.webp"), "loose thumb still packed");

console.log(
  JSON.stringify(
    {
      ok: true,
      zipBytes: zipBuf.length,
      registryKeys: Object.keys(registry).sort(),
      hasMapPng: Object.keys(registry).some((k) => k.startsWith("map/")),
      packedPhotos: names.filter((n) => n.startsWith("photos/")),
    },
    null,
    2
  )
);
