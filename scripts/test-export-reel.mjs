import assert from "node:assert/strict";
import {
  selectReelFrames,
  buildReelManifest,
  clipOverlayText,
  resolveFrameCaption,
  resolveReadableCaption,
  fitCaptionsToClipHolds,
  captionCharBudget,
  REEL_BEAT_PATTERN,
  REEL_HOOK_SECONDS,
  REEL_CHAPTER_SECONDS,
  REEL_CROSSFADE_SECONDS,
  REEL_CAPTION_MAX_CHARS,
} from "../src/lib/export-reel.ts";
import { coalesceMapPoints, buildReelMapPlan } from "../src/lib/export-reel-map.ts";

const PLACE_TYPES = ["RESTAURANT", "BEACH", "MUSEUM", "PARK", "CAFE"];

const photos = Array.from({ length: 28 }, (_, i) => ({
  id: `p${i}`,
  mediaType: "IMAGE",
  posterFilename: null,
  exifDateTime: new Date(Date.UTC(2024, 5, 1 + (i % 5), 12, 0, 0)),
  isTransportStart: i === 0,
  isTransportEnd: i === 27,
  selected: true,
  placeName: i % 3 === 0 ? `Lugar ${i}` : null,
  placeComment: i % 3 === 0 ? `Nota del sitio ${i}` : null,
  placeType: i % 3 === 0 ? PLACE_TYPES[i % PLACE_TYPES.length] : null,
  comments:
    i % 4 === 0
      ? [
          i === 4
            ? "Sol en Belém"
            : `Foto genial número ${i} con mucho detalle innecesario para leer en un segundo`,
        ]
      : [],
  highlightScore: i % 5 === 0 ? 9 : 5,
  latitude: 38.7 + i * 0.01,
  longitude: -9.1 + i * 0.01,
}));

assert.ok(clipOverlayText("a".repeat(100)).endsWith("…"));
assert.ok(clipOverlayText("a".repeat(100)).length <= REEL_CAPTION_MAX_CHARS + 1);
assert.equal(resolveReadableCaption({ comments: ["Sol en Belém"] }, 1.6), "Sol en Belém");
assert.equal(
  resolveReadableCaption(
    {
      comments: ["Una frase larguísima que nadie puede leer en medio segundo de clip"],
      placeName: "Plaza",
    },
    0.8
  ),
  null,
  "long text dropped when hold is too short"
);
assert.ok(resolveFrameCaption(photos[4])?.includes("Sol en Belém"));

const frames = selectReelFrames(photos, 30, [
  { dayKey: "2024-06-01", text: "Llegamos cansados pero felices", author: "Ada" },
]);
assert.ok(frames.length >= 5 && frames.length <= 10, `frames30=${frames.length}`);
assert.ok(!frames.some((f) => f.photoId === "p0"));
assert.ok(frames.some((f) => f.hero));
assert.ok(frames.every((f) => f.role === "clip"));
assert.ok(frames.every((f) => f.treatment && f.transitionOut && f.captionStyle));
assert.ok(frames.some((f) => f.sticker), "expected place-type sticker");
const treatmentSet = new Set(frames.map((f) => f.treatment));
assert.ok(
  treatmentSet.size >= 2,
  `expected treatment variety, got ${[...treatmentSet].join(",")}`
);

const frames60 = selectReelFrames(photos, 60, []);
assert.ok(frames60.length <= 20, `frames60=${frames60.length}`);
assert.ok(frames60.length >= 12, `frames60 should use more photos, got ${frames60.length}`);

const manifest = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada", "Bob"],
  startDate: "2024-06-01",
  endDate: "2024-06-05",
  photos,
  places: [
    {
      name: "Belém",
      type: "CAFE",
      latitude: 38.697,
      longitude: -9.206,
      comment: "Pasteles",
      visitedAt: "2024-06-02T15:00:00.000Z",
    },
  ],
  dayNotes: [
    { dayKey: "2024-06-02", text: "Paseo largo", author: "Bob" },
  ],
  gpsTracks: [
    {
      id: "trk1",
      includeInExport: true,
      alias: "Ada",
      points: [
        { lat: 38.7, lng: -9.14 },
        { lat: 38.71, lng: -9.15 },
        { lat: 38.72, lng: -9.16 },
        { lat: 38.73, lng: -9.17 },
      ],
    },
  ],
  durationSeconds: 15,
});
assert.equal(manifest.width, 1080);
assert.equal(manifest.height, 1920);
assert.ok(manifest.coverPhotoId, "brutal cover photo id");
assert.ok(manifest.ctaLine.includes("Lisboa") || manifest.ctaLine.includes("👇"));
assert.ok(manifest.frames.some((f) => f.role === "hook"), "hook frame");
assert.ok(
  manifest.frames.some((f) => f.role === "chapter"),
  "day chapter intertitle"
);
const hook = manifest.frames.find((f) => f.role === "hook");
assert.ok(hook && Math.abs(hook.durationSeconds - REEL_HOOK_SECONDS) < 0.05);
const chapter = manifest.frames.find((f) => f.role === "chapter");
assert.ok(chapter && Math.abs(chapter.durationSeconds - REEL_CHAPTER_SECONDS) < 0.05);
const clipDurations = manifest.frames
  .filter((f) => f.role === "clip")
  .map((f) => f.durationSeconds);
assert.ok(clipDurations.length <= 6, `clip count 15s ${clipDurations.length}`);
assert.ok(manifest.map);
assert.ok(manifest.map.points.length >= 2);
assert.ok((manifest.map.gpsTrails?.length ?? 0) >= 1, "gps trails on map plan");
assert.ok(manifest.mapIntroSeconds > 0);
assert.ok(
  manifest.crossfadeSeconds >= 0.35 && manifest.crossfadeSeconds <= 0.55,
  `crossfade ~0.4s, got ${manifest.crossfadeSeconds}`
);
assert.ok(manifest.outroSeconds >= 1.5, "strong CTA outro length");
assert.ok(manifest.secondsPerClip >= 0.55);

const manifest30 = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada"],
  startDate: "2024-06-01",
  endDate: "2024-06-05",
  photos,
  durationSeconds: 30,
});
const clips30 = manifest30.frames.filter((f) => f.role === "clip");
assert.ok(clips30.length <= 10, `30s photo clips ${clips30.length}`);
const beats30 = new Set(clips30.map((f) => f.durationSeconds.toFixed(2)));
assert.ok(
  beats30.size >= 2 || clips30.length < 3,
  `expected irregular beat pacing on 30s, got ${[...beats30].join(",")}`
);
for (const clip of manifest30.frames.filter((f) => f.caption)) {
  const hold = Math.max(0.45, clip.durationSeconds - REEL_CROSSFADE_SECONDS);
  assert.ok(
    clip.caption.length <= captionCharBudget(hold) + 1,
    `caption too long for hold: "${clip.caption}" @ ${hold.toFixed(2)}s`
  );
}

const fitted = fitCaptionsToClipHolds([
  {
    ...frames[0],
    caption: "Texto imposible de leer porque es enormemente largo y el clip dura casi nada",
    durationSeconds: 0.9,
    role: "clip",
    placeName: "Mirador",
  },
]);
assert.equal(fitted[0].caption, null, "unreadable caption cleared; place remains");
assert.equal(fitted[0].placeName, "Mirador");

const coalesced = coalesceMapPoints([
  { lat: 38.7, lng: -9.1, kind: "photo", label: null, at: "a" },
  { lat: 38.7, lng: -9.1, kind: "place", label: "X", at: "b" },
]);
assert.equal(coalesced.length, 1);
assert.equal(coalesced[0].kind, "place");

assert.equal(buildReelMapPlan([{ lat: 1, lng: 1, kind: "photo", label: null, at: null }]), null);

console.log("export-reel ok", {
  frames30: frames.length,
  frames60: frames60.length,
  clips30: clips30.length,
  frames15: manifest.frames.length,
  hooks: manifest.frames.filter((f) => f.role === "hook").length,
  chapters: manifest.frames.filter((f) => f.role === "chapter").length,
  clips: manifest.frames.filter((f) => f.role === "clip").length,
  crossfade: manifest.crossfadeSeconds,
  beatPattern: [...REEL_BEAT_PATTERN],
  clipDurations: clipDurations.map((d) => d.toFixed(2)),
  avgClip: manifest.secondsPerClip.toFixed(2),
});
