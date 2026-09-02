import assert from "node:assert/strict";
import { selectReelFrames, buildReelManifest } from "../src/lib/export-reel.ts";

const photos = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i}`,
  mediaType: "IMAGE",
  posterFilename: null,
  exifDateTime: new Date(Date.UTC(2024, 5, 1 + (i % 5), 12, 0, 0)),
  isTransportStart: i === 0,
  isTransportEnd: i === 19,
  selected: true,
  placeName: i % 3 === 0 ? `Lugar ${i}` : null,
}));

const frames = selectReelFrames(photos, 30);
assert.ok(frames.length >= 5 && frames.length <= 14);
assert.ok(!frames.some((f) => f.photoId === "p0")); // skips transport when alternatives exist
assert.ok(frames.some((f) => f.placeName));

const manifest = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada", "Bob"],
  startDate: "2024-06-01",
  endDate: "2024-06-05",
  photos,
  durationSeconds: 15,
});
assert.equal(manifest.width, 1080);
assert.equal(manifest.height, 1920);
assert.ok(manifest.frames.length <= 8);
assert.ok(manifest.secondsPerClip >= 1.2);

console.log("export-reel ok", {
  frames30: frames.length,
  frames15: manifest.frames.length,
  secondsPerClip: manifest.secondsPerClip,
});
