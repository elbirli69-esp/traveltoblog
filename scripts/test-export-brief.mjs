import assert from "node:assert/strict";
import {
  defaultExportDirectives,
  parseExportDirectives,
  summarizeHtmlDirectives,
  summarizeReelDirectives,
  htmlDirectiveBodyClasses,
} from "../src/lib/export-directives.ts";
import { groundExportBriefHeuristically } from "../src/lib/export-brief.ts";
import {
  applyReelCaptionMode,
  buildReelManifest,
  selectReelFrames,
} from "../src/lib/export-reel.ts";
import {
  applyHtmlSectionOrderBias,
  clampProseHtml,
  collectPrimaryStoryPhotoIds,
  resolveHtmlTemplateFromBrief,
} from "../src/lib/export-html-directives.ts";
import { buildExportHtml } from "../src/lib/export-html.ts";

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
assert.ok(summarizeHtmlDirectives(visual.html).includes("fotos grandes"));
assert.ok(htmlDirectiveBodyClasses(visual.html).includes("export-dir--images-high"));

const noise = groundExportBriefHeuristically(
  "Hola, el viaje fue genial y comimos pasta",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(noise.reel?.pacing, "balanced");
assert.equal(noise.reel?.captionMode, "short");

const summary = summarizeReelDirectives(calm.reel);
assert.ok(summary.includes("calmado") || summary.includes("sin textos"));

// --- prose clamp + section order ---
const multi = "<p>Uno</p><p>Dos</p><p>Tres</p>";
assert.equal(clampProseHtml(multi, "low"), "<p>Uno</p>");
assert.equal(clampProseHtml(multi, "high"), multi);
assert.deepEqual(
  applyHtmlSectionOrderBias(
    ["timeline", "gallery", "guide", "closing"],
    undefined,
    "low"
  ),
  ["timeline", "guide", "gallery", "closing"]
);
assert.equal(
  applyHtmlSectionOrderBias(
    ["timeline", "map", "guide"],
    ["guide", "timeline"],
    "medium"
  )[0],
  "guide"
);

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

// --- HTML export applies body classes + clamps prose ---
const htmlPhotos = [
  {
    id: "p1",
    url: "/uploads/t1/p1.jpg",
    localPath: "photos/002.webp",
    thumbPath: "photos/002-thumb.webp",
    latitude: 50.06,
    longitude: 19.94,
    mediaType: "IMAGE",
    videoPath: null,
    exifDateTime: new Date("2024-06-02T10:00:00Z"),
    alias: "Ada",
    isTransportStart: false,
    isTransportEnd: false,
    highlightScore: 8,
    placeId: "pl1",
  },
];
const longJournal = `# Krakow

Intro uno.

Intro dos.

## lunes, 2 de junio de 2024

Párrafo A del día.

Párrafo B del día.

Párrafo C del día.

## Conclusión

Fin uno.

Fin dos.
`;
const htmlOut = buildExportHtml({
  travel: {
    id: "t1",
    title: "Krakow",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown: longJournal,
    travelType: "INTERNATIONAL",
  },
  users: [{ id: "u1", alias: "Ada" }],
  photos: htmlPhotos,
  places: [
    {
      id: "pl1",
      name: "Plaza",
      type: "MUSEUM",
      latitude: 50.06,
      longitude: 19.94,
      comment: "Nota larga de la guía",
      alias: "Ada",
      visitedAt: new Date("2024-06-02"),
      highlightScore: 9,
    },
  ],
  template: "magazine",
  typology: "INTERNATIONAL",
  htmlDirectives: visual.html,
  briefInterpretation: visual.interpretation,
});
assert.ok(htmlOut.includes("export-dir--images-high"));
assert.ok(htmlOut.includes("export-dir--gallery-high"));
assert.ok(htmlOut.includes("export-dir--prose-low"));
const dayProseBlocks = [...htmlOut.matchAll(/<div class="story-day-prose[^"]*">([\s\S]*?)<\/div>/g)].map(
  (m) => m[1]
);
assert.ok(dayProseBlocks.some((b) => b.includes("Párrafo A del día")));
assert.ok(
  dayProseBlocks.every((b) => !b.includes("Párrafo B del día")),
  "low prose clamps day paragraphs in story-day-prose"
);
assert.ok(htmlOut.includes('id="galeria"') || htmlOut.includes("gallery-section"));

const galleryIdx = htmlOut.indexOf('id="galeria"');
const guideIdx = htmlOut.indexOf('id="guia"');
assert.ok(galleryIdx > 0 && guideIdx > galleryIdx, "gallery before guide by default when high");

// --- dark theme keeps magazine structure (no soft-switch to dark-photo) ---
const darkBrief = groundExportBriefHeuristically(
  "Quiero modo oscuro, fotos grandes y formas destacadas, sin repetir fotos",
  { target: "html" }
);
assert.equal(darkBrief.html?.theme, "dark");
assert.equal(darkBrief.html?.imageEmphasis, "high");
assert.ok(summarizeHtmlDirectives(darkBrief.html).includes("modo oscuro"));

assert.equal(
  resolveHtmlTemplateFromBrief("magazine", darkBrief.html),
  "magazine",
  "theme must not change HTML structure"
);
assert.equal(
  resolveHtmlTemplateFromBrief("dark-photo-journey", { ...darkBrief.html, theme: "light" }),
  "dark-photo-journey",
  "UI template always wins for structure"
);

const darkHtml = buildExportHtml({
  travel: {
    id: "t1",
    title: "Krakow",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown: longJournal,
    travelType: "INTERNATIONAL",
  },
  users: [{ id: "u1", alias: "Ada" }],
  photos: htmlPhotos,
  places: [
    {
      id: "pl1",
      name: "Plaza",
      type: "MUSEUM",
      latitude: 50.06,
      longitude: 19.94,
      comment: "Nota guía",
      alias: "Ada",
      visitedAt: new Date("2024-06-02"),
      highlightScore: 9,
    },
  ],
  template: "magazine",
  typology: "INTERNATIONAL",
  htmlDirectives: darkBrief.html,
  briefInterpretation: darkBrief.interpretation,
});
assert.ok(darkHtml.includes("export-dir--theme-dark"), "dark theme body class");
assert.ok(
  darkHtml.includes("export-dir--theme-dark") &&
    (darkHtml.includes("--bg: #0c0a09") || darkHtml.includes("color-scheme: dark")),
  "dark theme CSS knobs applied on magazine structure"
);
assert.ok(
  darkHtml.includes('id="guia"') || darkHtml.includes("mag-"),
  "magazine structure preserved under dark theme"
);

const guideSlice =
  darkHtml.includes('id="guia"')
    ? darkHtml.slice(darkHtml.indexOf('id="guia"'), darkHtml.indexOf('id="cierre"') >= 0 ? darkHtml.indexOf('id="cierre"') : undefined)
    : "";
assert.ok(
  !guideSlice.includes("002-thumb") && !guideSlice.includes("photos/002"),
  "guide must not reuse the story photo"
);

const storySlice = darkHtml.includes('id="cronologia"')
  ? darkHtml.slice(
      darkHtml.indexOf('id="cronologia"'),
      darkHtml.indexOf('id="galeria"') >= 0 ? darkHtml.indexOf('id="galeria"') : undefined
    )
  : darkHtml;
const storyThumbHits = (storySlice.match(/002-thumb\.webp/g) || []).length;
assert.ok(
  storyThumbHits <= 1,
  `story should show each photo at most once, got ${storyThumbHits} thumb hits`
);

const primary = collectPrimaryStoryPhotoIds([
  { kind: "photo", meta: { photoId: "p1" } },
  { kind: "place", meta: { placeId: "pl1", photoId: "p1" } },
  { kind: "flight-out", meta: { photoId: "p2" } },
]);
assert.ok(primary.has("p1") && primary.has("p2"));
assert.equal(primary.size, 2);

console.log("export-brief ok", {
  fewClips: fewClips.length,
  fastClips: fastClips.length,
  calmSummary: summary,
  selected: selected.length,
  htmlClasses: htmlDirectiveBodyClasses(visual.html),
  darkTheme: darkBrief.html?.theme,
});
