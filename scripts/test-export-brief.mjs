import assert from "node:assert/strict";
import {
  defaultExportDirectives,
  parseExportDirectives,
  summarizeReelDirectives,
} from "../src/lib/export-directives.ts";
import { groundExportBriefHeuristically } from "../src/lib/export-brief.ts";
import {
  applyReelCaptionMode,
  buildReelManifest,
  selectReelFrames,
} from "../src/lib/export-reel.ts";

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
  placeType: i % 3 === 0 ? "CAFE" : null,
  comments: i % 4 === 0 ? [`Comentario foto ${i}`] : [],
  highlightScore: i % 5 === 0 ? 9 : 5,
  latitude: 38.7 + i * 0.01,
  longitude: -9.1 + i * 0.01,
}));

// --- parse / clamp ---
const parsed = parseExportDirectives({
  version: 1,
  interpretation: "  Muchas fotos  ",
  reel: {
    pacing: "punchy",
    captionMode: "none",
    targetPhotoCount: 99,
    transitionSeconds: 0.9,
    heroBias: "high",
    unknownKnob: true,
  },
  html: { imageEmphasis: "high", bogus: 1 },
});
assert.equal(parsed.version, 1);
assert.equal(parsed.interpretation, "Muchas fotos");
assert.equal(parsed.reel?.pacing, "punchy");
assert.equal(parsed.reel?.captionMode, "none");
assert.ok((parsed.reel?.targetPhotoCount ?? 0) <= 24);
assert.ok((parsed.reel?.transitionSeconds ?? 0) <= 0.55);
assert.equal(parsed.html?.imageEmphasis, "high");
assert.equal(parsed.html?.proseDensity, "medium");

const empty = parseExportDirectives(null);
assert.deepEqual(empty.reel?.pacing, defaultExportDirectives().reel?.pacing);

// --- heuristic grounding of free text ---
const calm = groundExportBriefHeuristically(
  "Quiero pocas fotos tranquilas, casi sin texto, con fundidos suaves",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(calm.reel?.captionMode, "none");
assert.equal(calm.reel?.pacing, "calm");
assert.equal(calm.reel?.transitionStyle, "softFade");
assert.ok((calm.reel?.targetPhotoCount ?? 99) <= 8);
assert.ok(calm.interpretation?.toLowerCase().includes("sin texto") || calm.interpretation);

const punchy = groundExportBriefHeuristically(
  "Ritmo rápido, textos cortos, muchas fotos",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(punchy.reel?.pacing, "punchy");
assert.equal(punchy.reel?.captionMode, "short");
assert.ok((punchy.reel?.targetPhotoCount ?? 0) >= 10);

const visual = groundExportBriefHeuristically(
  "Máximo protagonismo fotográfico y galería muy visible, poca crónica",
  { target: "html" }
);
assert.equal(visual.html?.imageEmphasis, "high");
assert.equal(visual.html?.galleryEmphasis, "high");
assert.equal(visual.html?.proseDensity, "low");

const noise = groundExportBriefHeuristically(
  "Hola, el viaje fue genial y comimos pasta",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(noise.reel?.pacing, "balanced");
assert.equal(noise.reel?.captionMode, "short");

const summary = summarizeReelDirectives(calm.reel);
assert.ok(summary.includes("calmado") || summary.includes("sin textos"));

// --- apply to reel manifest ---
const few = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada"],
  startDate: "2024-06-01",
  endDate: "2024-06-05",
  photos,
  durationSeconds: 30,
  reelDirectives: calm.reel,
  briefInterpretation: calm.interpretation,
});
const fewClips = few.frames.filter((f) => f.role === "clip");
assert.ok(fewClips.length <= 8, `few clips got ${fewClips.length}`);
assert.ok(
  fewClips.every((f) => f.caption == null),
  "captionMode none clears captions"
);
assert.equal(few.briefInterpretation, calm.interpretation);
assert.ok(few.crossfadeSeconds >= 0.45);

const fast = buildReelManifest({
  title: "Lisboa",
  participants: ["Ada"],
  startDate: "2024-06-01",
  endDate: "2024-06-05",
  photos,
  durationSeconds: 30,
  reelDirectives: punchy.reel,
});
const fastClips = fast.frames.filter((f) => f.role === "clip");
assert.ok(fastClips.length >= 8, `punchy should pick more clips, got ${fastClips.length}`);
assert.ok(fast.crossfadeSeconds <= 0.3);

const selected = selectReelFrames(photos, 30, [], false, {
  targetPhotoCount: 6,
  pacing: "calm",
  captionMode: "placeOnly",
  captionPlacement: "bottom",
  transitionStyle: "softFade",
  transitionSeconds: 0.5,
  heroBias: "high",
});
assert.ok(selected.length <= 6, `targetPhotoCount 6 got ${selected.length}`);

const stripped = applyReelCaptionMode(
  [
    {
      ...selected[0],
      caption: "hola",
      dayNote: "día",
      role: "clip",
    },
  ],
  "placeOnly"
);
assert.equal(stripped[0].caption, null);
assert.equal(stripped[0].dayNote, null);

console.log("export-brief ok", {
  fewClips: fewClips.length,
  fastClips: fastClips.length,
  calmSummary: summary,
  selected: selected.length,
});
