/**
 * Phase D quality: near-dupe reel picking + HTML weight warnings.
 */
import assert from "node:assert/strict";
import { isNearDuplicateReelCandidate } from "../src/lib/export-reel.ts";
import { buildExportWarnings } from "../src/lib/export-warnings.ts";

// --- Near-duplicate GPS ---
assert.equal(
  isNearDuplicateReelCandidate(
    {
      id: "b",
      latitude: 40.0,
      longitude: -3.0,
      placeName: "Plaza",
      exifDateTime: new Date("2024-06-01T12:00:05Z"),
    },
    [
      {
        photoId: "a",
        latitude: 40.0,
        longitude: -3.0,
        placeName: "Plaza",
        exifDateTime: new Date("2024-06-01T12:00:00Z"),
      },
    ]
  ),
  true,
  "same GPS+time cluster should be near-dupe"
);

assert.equal(
  isNearDuplicateReelCandidate(
    {
      id: "c",
      latitude: 41.0,
      longitude: -3.5,
      placeName: "Plaza",
      exifDateTime: new Date("2024-06-02T18:00:00Z"),
    },
    [
      {
        photoId: "a",
        latitude: 40.0,
        longitude: -3.0,
        placeName: "Plaza",
        exifDateTime: new Date("2024-06-01T12:00:00Z"),
      },
    ]
  ),
  false,
  "same place name alone on another day/location should NOT block"
);

assert.equal(
  isNearDuplicateReelCandidate(
    {
      id: "d",
      latitude: 41.0,
      longitude: -3.5,
      placeName: "Otro",
      exifDateTime: new Date("2024-06-01T12:00:00Z"),
    },
    [
      {
        photoId: "a",
        latitude: 40.0,
        longitude: -3.0,
        placeName: "Plaza",
        exifDateTime: new Date("2024-06-01T12:00:00Z"),
      },
    ]
  ),
  false,
  "identical clock time at a distant GPS must NOT block"
);

// --- HTML weight warnings ---
const base = {
  startDate: new Date("2024-06-01"),
  endDate: new Date("2024-06-03"),
  journalMarkdown: "hola",
  photos: Array.from({ length: 15 }, () => ({
    latitude: 1,
    longitude: 2,
    exifDateTime: new Date("2024-06-01"),
  })),
  notes: [],
};

const zipWarnings = buildExportWarnings({ ...base, format: "zip" });
assert.ok(
  !zipWarnings.some((w) => /HTML único|base64/i.test(w.message)),
  "ZIP should not warn about HTML embed weight"
);

const htmlWarnings = buildExportWarnings({ ...base, format: "html" });
assert.ok(
  htmlWarnings.some((w) => /HTML único|base64/i.test(w.message)),
  "HTML format should warn about embed weight"
);

const heavy = buildExportWarnings({
  ...base,
  format: "html",
  photos: Array.from({ length: 30 }, () => ({
    latitude: 1,
    longitude: 2,
    exifDateTime: new Date("2024-06-01"),
  })),
});
assert.ok(
  heavy.some((w) => w.level === "warning" && /HTML único/i.test(w.message)),
  "25+ photos in HTML should be a warning"
);

console.log("test-export-quality-d: ok");
