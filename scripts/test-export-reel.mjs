import assert from "node:assert/strict";
import {
  selectReelFrames,
  buildReelManifest,
  clipOverlayText,
  truncateAtWordBoundary,
  resolveFrameCaption,
  resolveReadableCaption,
  fitCaptionsToClipHolds,
  captionCharBudget,
  filterReelInputsForDayKey,
  parseReelDayKey,
  reelReadmeText,
  REEL_BEAT_PATTERN,
  REEL_HOOK_SECONDS,
  REEL_CHAPTER_SECONDS,
  REEL_CROSSFADE_SECONDS,
  REEL_CAPTION_MAX_CHARS,
} from "../src/lib/export-reel.ts";
import { coalesceMapPoints, buildReelMapPlan, computeMapView, buildReelPlaceBasemapPath, REEL_PLACE_FOCUS_ZOOM } from "../src/lib/export-reel-map.ts";

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
// Word-boundary truncate: never split a word when a shorter complete phrase fits.
assert.equal(
  truncateAtWordBoundary("plaza mayor de Madrid centro", 18),
  "plaza mayor de…"
);
{
  const clipped = truncateAtWordBoundary("amanecer sobre el Duero", 16);
  assert.equal(clipped, "amanecer sobre…");
  assert.ok(clipped.endsWith("…"));
}
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
{
  const outs = frames.map((f) => f.transitionOut);
  assert.ok(
    new Set(outs).size >= 3,
    `mixed style should vary transitions, got ${[...new Set(outs)].join(",")}`
  );
  for (let i = 1; i < outs.length; i++) {
    assert.notEqual(
      outs[i],
      outs[i - 1],
      `consecutive transitions should differ at ${i}: ${outs[i - 1]} → ${outs[i]}`
    );
  }
}
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
// Opening must not loop cover→map→same cover as Día 1 / title flash.
assert.equal(
  manifest.titleIntroSeconds,
  0,
  "skip redundant title flash when hook/map already open the reel"
);
assert.ok(
  !manifest.frames.some(
    (f) => f.role !== "hook" && f.photoId === hook.photoId
  ),
  "hook cover photo must not repeat as chapter/clip in the body"
);

// Body clips must be chronological by dayKey (undated last); chapters once per day.
const bodyClips = manifest.frames.filter((f) => f.role === "clip" && f.dayKey);
const clipDays = bodyClips.map((f) => f.dayKey);
for (let i = 1; i < clipDays.length; i++) {
  assert.ok(
    clipDays[i] >= clipDays[i - 1],
    `clip days must be chronological, got ${clipDays.join(",")}`
  );
}
const chapters = manifest.frames.filter((f) => f.role === "chapter");
const chapterDays = chapters.map((f) => f.dayKey);
assert.equal(
  chapterDays.length,
  new Set(chapterDays).size,
  `chapters must appear once per day, got ${chapterDays.join(",")}`
);
for (let i = 0; i < manifest.frames.length - 1; i++) {
  const a = manifest.frames[i];
  const b = manifest.frames[i + 1];
  if (a.role === "chapter" && b.role === "clip") {
    // Chapter is a solid card in the encoder; photoId may match for asset loading
    // but chapters must not visually loop — we still assert day progression.
    assert.ok(a.dayKey === b.dayKey, "chapter must label the following clip day");
  }
}

// If hook is from day D, that day must not also get a chapter card (avoids staged repeats).
if (hook.dayKey) {
  assert.ok(
    !manifest.frames.some((f) => f.role === "chapter" && f.dayKey === hook.dayKey),
    "hook day should skip chapter card"
  );
}
// Captioned clips need a readable hold (after crossfade).
for (const clip of manifest.frames.filter((f) => f.role === "clip" && f.caption)) {
  const hold = clip.durationSeconds - REEL_CROSSFADE_SECONDS;
  assert.ok(
    hold >= 2.0,
    `captioned clip hold too short: ${hold.toFixed(2)}s for "${clip.caption?.slice(0, 24)}"`
  );
}

const chapter = manifest.frames.find((f) => f.role === "chapter");
assert.ok(chapter && Math.abs(chapter.durationSeconds - REEL_CHAPTER_SECONDS) < 0.05);
const clipDurations = manifest.frames
  .filter((f) => f.role === "clip")
  .map((f) => f.durationSeconds);
assert.ok(clipDurations.length <= 6, `clip count 15s ${clipDurations.length}`);
assert.ok(manifest.map);
assert.ok(manifest.map.points.length >= 2);
assert.equal(manifest.map.overview, "flights", "ida/vuelta pins prefer flight trayecto");
assert.ok(manifest.map.flightLegs.length >= 1);
assert.equal(manifest.map.gpsTrails.length, 0, "flight overview omits destination GPS trails");
assert.ok(manifest.mapIntroSeconds > 0);

// Local route overview (no ida/vuelta) still shows GPS trails.
const localPhotos = photos.map((p) => ({
  ...p,
  isTransportStart: false,
  isTransportEnd: false,
}));
const localManifest = buildReelManifest({
  title: "Lisboa local",
  participants: ["Ada"],
  startDate: "2024-06-01",
  endDate: "2024-06-05",
  photos: localPhotos,
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
  durationSeconds: 15,
  gpsTracks: [
    {
      id: "trk-local",
      includeInExport: true,
      alias: "Ada",
      points: [
        { lat: 38.7, lng: -9.14 },
        { lat: 38.71, lng: -9.15 },
        { lat: 38.72, lng: -9.13 },
      ],
    },
  ],
});
assert.equal(localManifest.map?.overview, "route");
assert.ok((localManifest.map?.gpsTrails?.length ?? 0) >= 1, "gps trails on local route map");

// Flight overview matches Lugares trayecto: Spain↔Poland with airplanes,
// ignoring a France layover photo that would otherwise expand the frame.
const flightPhotos = [
  {
    id: "out-mad",
    mediaType: "IMAGE",
    posterFilename: null,
    exifDateTime: "2024-06-01T08:00:00.000Z",
    isTransportStart: true,
    isTransportEnd: false,
    selected: true,
    placeName: "MAD",
    comments: [],
    highlightScore: 5,
    latitude: 40.49,
    longitude: -3.57,
  },
  {
    id: "layover-cdg",
    mediaType: "IMAGE",
    posterFilename: null,
    exifDateTime: "2024-06-01T12:00:00.000Z",
    isTransportStart: false,
    isTransportEnd: false,
    selected: true,
    placeName: "CDG",
    comments: [],
    highlightScore: 5,
    latitude: 49.01,
    longitude: 2.55,
  },
  {
    id: "krakow",
    mediaType: "IMAGE",
    posterFilename: null,
    exifDateTime: "2024-06-02T10:00:00.000Z",
    isTransportStart: false,
    isTransportEnd: false,
    selected: true,
    placeName: "Kraków",
    comments: ["Plaza"],
    highlightScore: 8,
    latitude: 50.06,
    longitude: 19.94,
  },
  {
    id: "in-mad",
    mediaType: "IMAGE",
    posterFilename: null,
    exifDateTime: "2024-06-08T18:00:00.000Z",
    isTransportStart: false,
    isTransportEnd: true,
    selected: true,
    placeName: "MAD vuelta",
    comments: [],
    highlightScore: 5,
    latitude: 40.49,
    longitude: -3.57,
  },
];
const flightManifest = buildReelManifest({
  title: "Polonia",
  participants: ["Ada"],
  startDate: "2024-06-01",
  endDate: "2024-06-08",
  photos: flightPhotos,
  durationSeconds: 15,
  gpsTracks: [
    {
      id: "fr-noise",
      includeInExport: true,
      alias: "Ada",
      points: [
        { lat: 48.8, lng: 2.3 },
        { lat: 48.9, lng: 2.4 },
      ],
    },
  ],
});
assert.ok(flightManifest.map);
assert.equal(flightManifest.map.overview, "flights");
assert.ok(flightManifest.map.flightLegs.length >= 1, "flight legs on trayecto map");
assert.equal(flightManifest.map.gpsTrails.length, 0, "no GPS trails on flight overview");
assert.ok(
  flightManifest.map.points.every((p) => p.kind === "flight"),
  "flight overview pins are airports only"
);
assert.ok(
  !flightManifest.map.points.some((p) => Math.abs(p.lat - 49.01) < 0.5),
  "France layover must not pin the flight overview"
);
// Ida+vuelta share Madrid GPS — trayecto must still span to Poland, not collapse.
const flightCoords = flightManifest.map.flightLegs.flatMap((leg) => leg.coords);
assert.ok(
  flightCoords.some((c) => c[1] > 15),
  "flight path must reach Poland longitude"
);
assert.ok(
  flightCoords.some((c) => c[1] < 0),
  "flight path must include Spain longitude"
);
assert.ok(
  flightCoords.length > 4,
  "flight path should be densified into a visible arc"
);
assert.ok(
  flightManifest.map.center.lng > 0 && flightManifest.map.center.lng < 20,
  `flight center should sit between Spain and Poland, got lng=${flightManifest.map.center.lng}`
);
assert.ok(flightManifest.map.points.some((p) => p.kind === "flight"));
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
assert.equal(fitted[0].caption, null, "sub-1s hold clears caption; place remains");
assert.equal(fitted[0].placeName, "Mirador");

const fittedOk = fitCaptionsToClipHolds([
  {
    ...frames[0],
    caption: "Paseo largo junto al río con luz de atardecer",
    durationSeconds: 3.0,
    role: "clip",
    placeName: "Mirador",
  },
]);
assert.ok(fittedOk[0].caption && fittedOk[0].caption.length > 10, "readable hold keeps caption");

const coalesced = coalesceMapPoints([
  { lat: 38.7, lng: -9.1, kind: "photo", label: null, at: "a" },
  { lat: 38.7, lng: -9.1, kind: "place", label: "X", at: "b" },
]);
assert.equal(coalesced.length, 1);
assert.equal(coalesced[0].kind, "place");

assert.equal(buildReelMapPlan([{ lat: 1, lng: 1, kind: "photo", label: null, at: null }]), null);

const singleView = computeMapView([{ lat: 38.71, lng: -9.14, kind: "place", label: "Mirador", at: null }]);
assert.ok(singleView.zoom >= 15, `single place zoom too low: ${singleView.zoom}`);
assert.equal(singleView.center.lat, 38.71);
const tightView = computeMapView([
  { lat: 38.71, lng: -9.14, kind: "place", label: "A", at: null },
  { lat: 38.712, lng: -9.141, kind: "place", label: "B", at: null },
]);
assert.ok(tightView.zoom >= 14, `nearby places zoom too low: ${tightView.zoom}`);
assert.equal(REEL_PLACE_FOCUS_ZOOM, 16);
assert.ok(buildReelPlaceBasemapPath(38.71, -9.14).includes("zoom=16"));

// Memories look: cinematic map intro, no captions/chapters, soft fades.
const memoriesManifest = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada"],
  startDate: new Date("2024-06-01"),
  endDate: new Date("2024-06-05"),
  durationSeconds: 30,
  reelDirectives: {
    pacing: "calm",
    captionMode: "none",
    captionPlacement: "bottom",
    transitionStyle: "softFade",
    transitionSeconds: 0.75,
    heroBias: "high",
    mapBias: "high",
    look: "memories",
    targetPhotoCount: 8,
  },
  photos,
  places: [
    {
      id: "pl1",
      name: "Belém",
      type: "VIEWPOINT",
      latitude: 38.697,
      longitude: -9.206,
      comment: null,
      visitedAt: new Date("2024-06-02"),
      highlightScore: 8,
    },
  ],
});
assert.equal(memoriesManifest.look, "memories");
assert.ok(
  memoriesManifest.mapIntroSeconds >= 3,
  `memories map intro too short: ${memoriesManifest.mapIntroSeconds}`
);
assert.ok(
  memoriesManifest.crossfadeSeconds >= 0.7,
  `memories crossfade too short: ${memoriesManifest.crossfadeSeconds}`
);
assert.equal(
  memoriesManifest.frames.filter((f) => f.role === "chapter").length,
  0,
  "memories should skip day chapters"
);
assert.ok(
  memoriesManifest.frames.every((f) => !f.caption),
  "memories clips should be captionless"
);
{
  const outs = memoriesManifest.frames.map((f) => f.transitionOut);
  const soft = new Set(["fade", "fadeBlack", "zoomSoft"]);
  assert.ok(
    outs.every((t) => soft.has(t)),
    `memories should stay on soft transitions, got ${[...new Set(outs)].join(",")}`
  );
  assert.ok(
    new Set(outs).size >= 2,
    `memories should vary soft transitions, got ${outs.join(",")}`
  );
}
assert.ok(
  memoriesManifest.frames
    .filter((f) => f.role === "clip")
    .every((f) => f.treatment === "clean"),
  "memories body should stay photo-clean (map is intro)"
);

// Day scope: mid-trip Reel for a single calendar day.
assert.equal(parseReelDayKey("2024-06-02"), "2024-06-02");
assert.equal(parseReelDayKey("nope"), null);
assert.equal(parseReelDayKey("2024-6-2"), null);
{
  const scoped = filterReelInputsForDayKey({
    photos,
    dayNotes: [
      { dayKey: "2024-06-02", text: "Paseo por Belém", author: "Ada" },
      { dayKey: "2024-06-03", text: "Otro día", author: "Ada" },
    ],
    places: [
      {
        name: "Belém",
        type: "VIEWPOINT",
        latitude: 38.697,
        longitude: -9.206,
        comment: null,
        visitedAt: new Date("2024-06-02"),
        highlightScore: 8,
      },
      {
        name: "Alfama",
        type: "OTHER",
        latitude: 38.71,
        longitude: -9.13,
        comment: null,
        visitedAt: new Date("2024-06-04"),
        highlightScore: 5,
      },
    ],
    dayKey: "2024-06-02",
  });
  assert.ok(scoped.photos.length > 0, "day filter keeps that day's photos");
  assert.ok(
    scoped.photos.every(
      (p) =>
        p.exifDateTime &&
        new Date(p.exifDateTime).toISOString().startsWith("2024-06-02")
    ),
    "all scoped photos share the day"
  );
  assert.equal(scoped.dayNotes.length, 1);
  assert.equal(scoped.dayNotes[0]?.dayKey, "2024-06-02");
  assert.ok(scoped.places.some((p) => p.name === "Belém"));
  assert.ok(!scoped.places.some((p) => p.name === "Alfama"));
}

const dayManifest = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada"],
  startDate: new Date("2024-06-01"),
  endDate: new Date("2024-06-05"),
  durationSeconds: 30,
  dayKey: "2024-06-02",
  photos,
  dayNotes: [
    { dayKey: "2024-06-02", text: "Paseo por Belém", author: "Ada" },
  ],
});
assert.equal(dayManifest.scopeDayKey, "2024-06-02");
assert.ok(dayManifest.dateRangeLabel, "day reel has a date label");
assert.ok(
  dayManifest.frames
    .filter((f) => f.role === "clip" || f.role === "hook")
    .every((f) => !f.dayKey || f.dayKey === "2024-06-02"),
  "day reel frames stay on the chosen day"
);
assert.equal(
  dayManifest.frames.filter((f) => f.role === "chapter").length,
  0,
  "single-day reel skips chapter cards"
);
assert.ok(
  dayManifest.ctaLine.includes("Lisboa"),
  `cta should keep trip title: ${dayManifest.ctaLine}`
);
assert.ok(
  reelReadmeText(dayManifest).includes("Ámbito: un día"),
  "readme should mark day scope"
);

const emptyDay = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada"],
  startDate: new Date("2024-06-01"),
  endDate: new Date("2024-06-05"),
  durationSeconds: 15,
  dayKey: "2099-01-01",
  photos,
});
assert.equal(emptyDay.frames.length, 0, "unknown day yields no frames");
assert.equal(emptyDay.scopeDayKey, "2099-01-01");

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
  dayFrames: dayManifest.frames.length,
});
