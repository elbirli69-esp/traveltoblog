import assert from "node:assert/strict";
import {
  selectReelFrames,
  buildReelManifest,
  clipOverlayText,
  resolveFrameCaption,
} from "../src/lib/export-reel.ts";
import { coalesceMapPoints, buildReelMapPlan } from "../src/lib/export-reel-map.ts";

const photos = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i}`,
  mediaType: "IMAGE",
  posterFilename: null,
  exifDateTime: new Date(Date.UTC(2024, 5, 1 + (i % 5), 12, 0, 0)),
  isTransportStart: i === 0,
  isTransportEnd: i === 19,
  selected: true,
  placeName: i % 3 === 0 ? `Lugar ${i}` : null,
  placeComment: i % 3 === 0 ? `Nota del sitio ${i}` : null,
  comments: i % 4 === 0 ? [`Foto genial número ${i} con mucho detalle innecesario`] : [],
  highlightScore: i % 5 === 0 ? 9 : 5,
  latitude: 38.7 + i * 0.01,
  longitude: -9.1 + i * 0.01,
}));

assert.ok(clipOverlayText("a".repeat(100), 78).endsWith("…"));
assert.ok(resolveFrameCaption(photos[0])?.includes("Foto genial"));

const frames = selectReelFrames(photos, 30, [
  { dayKey: "2024-06-01", text: "Llegamos cansados pero felices", author: "Ada" },
]);
assert.ok(frames.length >= 5 && frames.length <= 16);
assert.ok(!frames.some((f) => f.photoId === "p0"));
assert.ok(frames.some((f) => f.caption));
assert.ok(frames.some((f) => f.hero));
assert.ok(frames.some((f) => f.durationSeconds >= 1.6));
assert.ok(frames.every((f) => f.treatment && f.transitionOut && f.captionStyle));
const treatmentSet = new Set(frames.map((f) => f.treatment));
assert.ok(
  treatmentSet.size >= 2,
  `expected treatment variety, got ${[...treatmentSet].join(",")}`
);
const captionStyles = new Set(
  frames.filter((f) => f.treatment === "story").map((f) => f.captionStyle)
);
assert.ok(captionStyles.size >= 1);

const manifest = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada", "Bob"],
  startDate: "2024-06-01",
  endDate: "2024-06-05",
  photos,
  places: [
    {
      name: "Belém",
      latitude: 38.697,
      longitude: -9.206,
      comment: "Pasteles",
      visitedAt: "2024-06-02T15:00:00.000Z",
    },
  ],
  dayNotes: [
    { dayKey: "2024-06-02", text: "Paseo largo", author: "Bob" },
  ],
  durationSeconds: 15,
});
assert.equal(manifest.width, 1080);
assert.equal(manifest.height, 1920);
assert.ok(manifest.frames.length <= 9);
assert.ok(manifest.map);
assert.ok(manifest.map.points.length >= 2);
assert.ok(manifest.mapIntroSeconds > 0);
assert.ok(manifest.crossfadeSeconds > 0);
assert.ok(manifest.secondsPerClip >= 0.9);

const coalesced = coalesceMapPoints([
  { lat: 38.7, lng: -9.1, kind: "photo", label: null, at: "a" },
  { lat: 38.7, lng: -9.1, kind: "place", label: "X", at: "b" },
]);
assert.equal(coalesced.length, 1);
assert.equal(coalesced[0].kind, "place");

assert.equal(buildReelMapPlan([{ lat: 1, lng: 1, kind: "photo", label: null, at: null }]), null);

console.log("export-reel ok", {
  frames30: frames.length,
  frames15: manifest.frames.length,
  mapPoints: manifest.map?.points.length,
  heroes: manifest.frames.filter((f) => f.hero).length,
  treatments: [...new Set(manifest.frames.map((f) => f.treatment))],
  transitions: [...new Set(manifest.frames.map((f) => f.transitionOut))],
  avgClip: manifest.secondsPerClip.toFixed(2),
});
