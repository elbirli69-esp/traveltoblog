/**
 * Phase D / quality-16: near-dupe picking, diverse pick, audio BPM, weight warnings.
 */
import assert from "node:assert/strict";
import { isNearDuplicateReelCandidate } from "../src/lib/export-reel.ts";
import {
  pickDiverseExportPhotos,
  exportPlaceKey,
} from "../src/lib/export-photo-pick.ts";
import {
  snapDurationToBpm,
  parseReelAudioPresetId,
  getReelAudioPreset,
} from "../src/lib/export/reel-audio.ts";
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

// --- Shared diverse pick + place soft-cap ---
{
  const burst = Array.from({ length: 12 }, (_, i) => ({
    id: `x${i}`,
    highlightScore: 9 - (i % 3),
    placeName: i < 8 ? "Café Central" : `Otro ${i}`,
    latitude: 40.4 + i * 0.00001,
    longitude: -3.7,
    exifDateTime: new Date(Date.UTC(2024, 5, 1, 12, i)),
  }));
  const picked = pickDiverseExportPhotos(burst, { max: 6, maxPerPlace: 2 });
  assert.ok(picked.length <= 6);
  const cafe = picked.filter((p) => p.placeName === "Café Central").length;
  assert.ok(cafe <= 3, `place diversity too weak: cafe=${cafe}`);
  assert.equal(exportPlaceKey("Café Central", null), "name:café central");
}

assert.equal(parseReelAudioPresetId("travel-beat"), "travel-beat");
assert.equal(getReelAudioPreset("soft-pulse").bpm, 72);
assert.ok(Math.abs(snapDurationToBpm(2.3, 72, 1.1) - (60 / 72) * 3) < 0.05);

// --- HTML / reel weight warnings ---
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

{
  const warnings = buildExportWarnings({
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown: "hola",
    format: "reel",
    photos: Array.from({ length: 32 }, () => ({
      latitude: 1,
      longitude: 2,
      exifDateTime: new Date("2024-06-02"),
    })),
    notes: [],
  });
  assert.ok(warnings.some((w) => /Reel/.test(w.message)));
}

console.log("test-export-quality-d: ok");
