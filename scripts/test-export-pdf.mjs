import assert from "node:assert/strict";
import {
  buildPrintHtml,
  clampPdfNote,
  extractPdfDayNarratives,
  planPdfPages,
  photoNoteCaption,
  stripMarkdownImagesAndBylines,
} from "../src/lib/export-pdf-layout.ts";
import { formatDateKey } from "../src/lib/travel-dates.ts";

assert.equal(clampPdfNote(""), "");
assert.equal(clampPdfNote("  Hola   mundo  "), "Hola mundo");
assert.ok(clampPdfNote("x".repeat(300)).endsWith("…"));
assert.ok(clampPdfNote("x".repeat(300)).length <= 221);

const basePhoto = {
  url: "/x",
  filename: "001.jpg",
  imagePath: "photos/001.jpg",
  bleedImagePath: "photos/001-bleed.jpg",
  latitude: 40.4,
  longitude: -3.7,
  exifDateTime: new Date("2024-06-02"),
  alias: "Ana",
  placeName: "Madrid",
  highlightScore: 9,
  notes: ["Qué vista"],
};

const longNote =
  "La noria de madera que repartía agua por toda la mina sigue ahí, pero ya lleva siglos saboreando su trabajo: la sal la ha ido royendo poco a poco hasta dejarla casi como una escultura viva del tiempo bajo tierra y aún hoy se oye el eco del mecanismo en las galerías húmedas.";
assert.ok(longNote.length > 220, "fixture note exceeds soft cap");
assert.ok(photoNoteCaption({ ...basePhoto, id: "n", notes: [longNote] }).endsWith("…"));
assert.ok(photoNoteCaption({ ...basePhoto, id: "n", notes: [longNote] }).length <= 221);

const html = buildPrintHtml({
  travel: {
    id: "t1",
    title: "Viaje prueba",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown:
      "## Día 1\n\nLlegamos al aeropuerto con mucho texto de crónica que ya no debe aparecer junto a las fotos featured.\n\n## Día 2\n\nPaseo por el centro.",
  },
  users: [{ alias: "Ana" }],
  photos: [
    { id: "p1", ...basePhoto },
    {
      id: "p2",
      ...basePhoto,
      filename: "002.jpg",
      imagePath: "photos/002.jpg",
      bleedImagePath: "photos/002-bleed.jpg",
      highlightScore: 6,
      notes: [longNote],
      exifDateTime: new Date("2024-06-02T15:00:00Z"),
    },
    {
      id: "p3",
      ...basePhoto,
      filename: "003.jpg",
      imagePath: "photos/003.jpg",
      bleedImagePath: "photos/003-bleed.jpg",
      highlightScore: 6,
      notes: ["Corta"],
      exifDateTime: new Date("2024-06-02T16:00:00Z"),
    },
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
  mapImagePath: "map/route.png",
  mapRouteMode: "segmented",
  mapPointCount: 3,
  mapDayLegend: [
    { dayKey: "2024-06-02", dayIndex: 0, color: "#2dd4bf", label: "Día 1 · 2 jun" },
    { dayKey: "2024-06-03", dayIndex: 1, color: "#f59e0b", label: "Día 2 · 3 jun" },
  ],
});

assert.ok(html.includes('src="photos/001-bleed.jpg"'), "bleed image on cover");
assert.ok(html.includes("page-cover"), "cover page");
assert.ok(html.includes("page-map"), "map page");
assert.ok(html.includes("map/route.png"), "map image path");
assert.ok(html.includes("map-legend"), "day legend container on map page");
assert.ok(html.includes("Día 1 · 2 jun"), "day 1 legend label");
assert.ok(html.includes("Día 2 · 3 jun"), "day 2 legend label");
assert.ok(html.includes("#2dd4bf"), "day 1 legend color");
assert.ok(html.includes("page-bleed") || html.includes("page-featured"), "interior layouts");
assert.ok(!html.includes("file://"), "no file:// urls");
assert.ok(html.includes("Capítulo") || html.includes("Recuerdos"), "day divider");
assert.ok(html.includes("divider-intro") || html.includes("Llegamos"), "crónica on day divider");
assert.ok(!html.includes("featured-narrative"), "no crónica wall on featured pages");
assert.ok(!html.includes("featured-text-col"), "no side text column on featured");
assert.ok(
  html.includes("featured-note") || html.includes("pair-note") || html.includes("caption-sub"),
  "note near photo"
);
assert.ok(
  html.includes("page-featured--noted") || html.includes("pair-mat--noted") || html.includes("page-pair--noted"),
  "noted layouts shrink the photo mat"
);
assert.ok(html.includes("page-featured--noted"), "noted photo uses featured layout");
assert.ok(/118mm|110mm/.test(html), "noted featured image height leaves room for caption");
assert.ok(!html.includes(longNote), "long notes are clamped in output");
assert.ok(html.includes("…"), "ellipsis for clamped notes");

const pages = planPdfPages({
  travel: {
    id: "t1",
    title: "Viaje prueba",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown: "## Día 1\n\nTexto largo de crónica para el separador.",
  },
  users: [{ alias: "Ana" }],
  photos: [
    {
      id: "p1",
      url: "/x",
      filename: "001.jpg",
      imagePath: "photos/001.jpg",
      bleedImagePath: "photos/001-bleed.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 9,
      notes: [],
    },
    {
      id: "p2",
      url: "/y",
      filename: "002.jpg",
      imagePath: "photos/002.jpg",
      bleedImagePath: "photos/002-bleed.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 4,
      notes: [],
    },
    {
      id: "p3",
      url: "/z",
      filename: "003.jpg",
      imagePath: "photos/003.jpg",
      bleedImagePath: "photos/003-bleed.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 3,
      notes: ["Nota media"],
    },
    {
      id: "p4",
      url: "/a",
      filename: "004.jpg",
      imagePath: "photos/004.jpg",
      bleedImagePath: "photos/004-bleed.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 2,
      notes: [],
    },
    {
      id: "p5",
      url: "/b",
      filename: "005.jpg",
      imagePath: "photos/005.jpg",
      bleedImagePath: "photos/005-bleed.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 1,
      notes: [],
    },
    {
      id: "p6",
      url: "/c",
      filename: "006.jpg",
      imagePath: "photos/006.jpg",
      bleedImagePath: "photos/006-bleed.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 2,
      notes: [],
    },
    {
      id: "p7",
      url: "/d",
      filename: "007.jpg",
      imagePath: "photos/007.jpg",
      bleedImagePath: "photos/007-bleed.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 3,
      notes: [],
    },
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
assert.ok(pages.some((p) => p.kind === "mosaic"), "busy day uses mosaic");
assert.ok(
  pages.filter((p) => p.kind === "mosaic").every((p) => [6, 8].includes(p.photos?.length ?? 0)),
  "mosaic pages are full sheets (6 or 8 photos), never a single half-empty row"
);
assert.ok(
  pages
    .filter((p) => p.kind === "full-bleed" || p.kind === "featured")
    .every((p) => (p.photos?.length ?? 0) === 1),
  "solo photo pages are single-image layouts"
);
assert.ok(
  pages.filter((p) => p.kind === "featured").every((p) => !p.narrative && !p.quote),
  "featured pages carry no journal narrative"
);
assert.ok(
  pages
    .filter((p) => p.kind === "featured")
    .every((p) => Boolean(p.photos?.[0] && (p.photos[0].notes?.length ?? 0) > 0)),
  "featured is reserved for photos with traveler notes"
);
assert.ok(
  pages.some((p) => p.kind === "day-divider" && p.narrative),
  "day divider keeps crónica"
);

const coverPages = planPdfPages({
  travel: {
    id: "t1",
    title: "Viaje",
    startDate: null,
    endDate: null,
    journalMarkdown: null,
  },
  users: [{ alias: "Ana" }],
  photos: [
    {
      id: "hero",
      url: "/h",
      filename: "001.jpg",
      imagePath: "photos/001.jpg",
      bleedImagePath: "photos/001-bleed.jpg",
      latitude: null,
      longitude: null,
      exifDateTime: new Date("2024-06-01"),
      alias: "Ana",
      highlightScore: 3,
      notes: [],
    },
    {
      id: "chosen",
      url: "/c",
      filename: "002.jpg",
      imagePath: "photos/002.jpg",
      bleedImagePath: "photos/002-bleed.jpg",
      latitude: null,
      longitude: null,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      highlightScore: 10,
      notes: [],
    },
  ],
  notes: [],
  format: "a4-landscape",
  template: "dark-magazine",
  coverPhotoId: "hero",
});
assert.equal(coverPages[0]?.photos?.[0]?.id, "hero", "custom cover photo id");

const darkHtml = buildPrintHtml({
  travel: {
    id: "t1",
    title: "Viaje",
    startDate: null,
    endDate: null,
    journalMarkdown: null,
  },
  users: [{ alias: "Ana" }],
  photos: [{ id: "p1", ...basePhoto }],
  notes: [],
  format: "a4-landscape",
  template: "dark-magazine",
});
assert.ok(darkHtml.includes("#0f0f0f"), "dark magazine theme");

// Journal pipeline embeds photos as ![Foto de X](url) + *author* under ### day headers.
// PDF must keep prose only — otherwise WeasyPrint dumps alt text as a text column.
const stripped = stripMarkdownImagesAndBylines(
  "Plaza del Mercado.\n\n![Foto de Irene](/api/photos/1/image)\n\n*Irene*\n\n![Foto de Rodri](/api/photos/2/image)\n\n*Rodri*\n"
);
assert.ok(stripped.includes("Plaza del Mercado"));
assert.ok(!stripped.includes("Foto de Irene"));
assert.ok(!stripped.includes("Foto de Rodri"));
assert.ok(!stripped.includes("*Irene*"));
assert.ok(!stripped.includes("/api/photos"));

const dayA = formatDateKey("2024-06-02", "long");
const dayB = formatDateKey("2024-06-03", "long");
const journalLike = `# Viaje

Intro.

---

## El viaje día a día

### ${dayA}

Plaza del Mercado, la plaza medieval más grande de Europa.

![Foto de Irene](/api/photos/1/image)

*Irene*

![Foto de Irene](/api/photos/2/image)

*Irene*

### ${dayB}

Segundo día en la costa.

![Foto de Rodri](/api/photos/3/image)

*Rodri*

---

## Lugares del recorrido

- **Plaza** · *Irene*

## Transporte

- Ida marcada

## Notas del viaje

- Reservar hotel
`;

const extracted = extractPdfDayNarratives(journalLike);
assert.equal(extracted.ordered.length, 2);
assert.ok(extracted.byTitle.get(dayA.toLowerCase())?.includes("Plaza del Mercado"));
assert.ok(extracted.byTitle.get(dayB.toLowerCase())?.includes("Segundo día"));
assert.ok(!extracted.ordered.join("").includes("Foto de Irene"));
assert.ok(!extracted.ordered.join("").includes("Foto de Rodri"));
assert.ok(!extracted.ordered.join("").includes("<img"));
assert.ok(
  !extracted.ordered.join("").includes("Lugares del recorrido"),
  "meta sections stripped from day prose"
);
assert.ok(!extracted.ordered.join("").includes("Transporte"));
assert.ok(!extracted.ordered.join("").includes("Notas del viaje"));

const pollutedPages = planPdfPages({
  travel: {
    id: "t1",
    title: "Cracovia",
    startDate: new Date("2024-06-02"),
    endDate: new Date("2024-06-03"),
    journalMarkdown: journalLike,
  },
  users: [{ alias: "Irene" }, { alias: "Rodri" }],
  photos: [
    {
      id: "p1",
      ...basePhoto,
      alias: "Irene",
      notes: [],
      exifDateTime: new Date("2024-06-02T10:00:00Z"),
    },
    {
      id: "p2",
      ...basePhoto,
      filename: "002.jpg",
      imagePath: "photos/002.jpg",
      bleedImagePath: "photos/002-bleed.jpg",
      alias: "Irene",
      highlightScore: 6,
      notes: [],
      exifDateTime: new Date("2024-06-02T11:00:00Z"),
    },
    {
      id: "p3",
      ...basePhoto,
      filename: "003.jpg",
      imagePath: "photos/003.jpg",
      bleedImagePath: "photos/003-bleed.jpg",
      alias: "Irene",
      highlightScore: 0,
      notes: [],
      exifDateTime: new Date("2024-06-02T12:00:00Z"),
    },
    {
      id: "p4",
      ...basePhoto,
      filename: "004.jpg",
      imagePath: "photos/004.jpg",
      bleedImagePath: "photos/004-bleed.jpg",
      alias: "Rodri",
      notes: [],
      exifDateTime: new Date("2024-06-03T10:00:00Z"),
    },
    {
      id: "p5",
      ...basePhoto,
      filename: "005.jpg",
      imagePath: "photos/005.jpg",
      bleedImagePath: "photos/005-bleed.jpg",
      alias: "Rodri",
      highlightScore: 6,
      notes: [],
      exifDateTime: new Date("2024-06-03T12:00:00Z"),
    },
    {
      id: "p6",
      ...basePhoto,
      filename: "006.jpg",
      imagePath: "photos/006.jpg",
      bleedImagePath: "photos/006-bleed.jpg",
      alias: "Rodri",
      highlightScore: 0,
      notes: [],
      exifDateTime: new Date("2024-06-03T14:00:00Z"),
    },
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
const dividers = pollutedPages.filter((p) => p.kind === "day-divider");
assert.ok(dividers.length >= 2, "two day dividers");
assert.ok(
  dividers[0]?.narrative?.includes("Plaza del Mercado"),
  "day prose on first divider"
);
const lastDivider = dividers[dividers.length - 1];
assert.ok(lastDivider?.narrative?.includes("Segundo día"), "last day prose on divider");
assert.ok(
  !lastDivider?.narrative?.includes("Lugares del recorrido"),
  "last day divider excludes lugares"
);
assert.ok(!lastDivider?.narrative?.includes("Transporte"), "last day excludes transporte");
assert.ok(!lastDivider?.narrative?.includes("Notas del viaje"), "last day excludes notas");

const sectionKinds = pollutedPages.map((p) => p.kind);
const placesIdx = sectionKinds.indexOf("section-places");
const transportIdx = sectionKinds.indexOf("section-transport");
const notesIdx = sectionKinds.indexOf("section-notes");
const closingIdx = sectionKinds.indexOf("closing");
assert.ok(placesIdx >= 0, "places section page");
assert.ok(transportIdx >= 0, "transport section page");
assert.ok(notesIdx >= 0, "notes section page");
assert.ok(placesIdx < transportIdx && transportIdx < notesIdx, "meta section order");
assert.ok(notesIdx < closingIdx, "meta sections before branding closing");
const lastDayPhotoIdx = Math.max(
  ...pollutedPages.map((p, i) =>
    p.photos?.some((ph) => ph.exifDateTime?.toISOString().startsWith("2024-06-03"))
      ? i
      : -1
  )
);
assert.ok(placesIdx > lastDayPhotoIdx, "places section after last day photos");

const pollutedHtml = buildPrintHtml({
  travel: {
    id: "t1",
    title: "Cracovia",
    startDate: new Date("2024-06-02"),
    endDate: new Date("2024-06-03"),
    journalMarkdown: journalLike,
  },
  users: [{ alias: "Irene" }],
  photos: [
    { id: "p1", ...basePhoto, notes: [], highlightScore: 9 },
    {
      id: "p2",
      ...basePhoto,
      filename: "002.jpg",
      imagePath: "photos/002.jpg",
      bleedImagePath: "photos/002-bleed.jpg",
      highlightScore: 6,
      notes: [],
    },
    {
      id: "p3",
      ...basePhoto,
      filename: "003.jpg",
      imagePath: "photos/003.jpg",
      bleedImagePath: "photos/003-bleed.jpg",
      highlightScore: 0,
      notes: [],
    },
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
assert.ok(!pollutedHtml.includes("Foto de Irene"), "HTML has no alt-text column");
assert.ok(pollutedHtml.includes("divider-intro img"), "CSS hides leftover imgs");
assert.ok(pollutedHtml.includes("page-section"), "meta sections render as own pages");
assert.ok(pollutedHtml.includes("Lugares del recorrido"), "lugares title on section page");
assert.ok(pollutedHtml.includes("Transporte"), "transporte title on section page");
assert.ok(pollutedHtml.includes("Notas del viaje"), "notas title on section page");
assert.ok(pollutedHtml.includes("Anexo"), "section eyebrow");


// Dense mosaic: eight small photos → one 2×4 page
function lowScorePhoto(id, day) {
  return {
    id,
    url: `/${id}`,
    filename: `${id}.jpg`,
    imagePath: `photos/${id}.jpg`,
    bleedImagePath: `photos/${id}-bleed.jpg`,
    latitude: 40.4,
    longitude: -3.7,
    exifDateTime: new Date(`2024-06-0${day}T12:00:00Z`),
    alias: "Ana",
    highlightScore: 2,
    notes: [],
  };
}

const densePages = planPdfPages({
  travel: {
    id: "t-dense",
    title: "Densidad",
    startDate: null,
    endDate: null,
    journalMarkdown: null,
  },
  users: [{ alias: "Ana" }],
  photos: Array.from({ length: 8 }, (_, i) => lowScorePhoto(`d${i + 1}`, 1)),
  notes: [],
  format: "a4-landscape",
  template: "classic",
  pdfDirectives: { mosaicBias: "high", preferFullBleed: "low", imageEmphasis: "low" },
});
const denseMosaics = densePages.filter((p) => p.kind === "mosaic");
assert.ok(denseMosaics.length >= 1, "eight small photos produce mosaic");
assert.ok(
  denseMosaics.some((p) => (p.photos?.length ?? 0) === 8),
  `small photos pack 8 per mosaic page (got ${denseMosaics.map((p) => p.photos?.length).join(",")})`
);
const denseHtml = buildPrintHtml({
  travel: {
    id: "t-dense-html",
    title: "Densidad HTML",
    startDate: null,
    endDate: null,
    journalMarkdown: null,
  },
  users: [{ alias: "Ana" }],
  photos: Array.from({ length: 8 }, (_, i) => lowScorePhoto(`h${i + 1}`, 1)),
  notes: [],
  format: "a4-landscape",
  template: "classic",
  pdfDirectives: { mosaicBias: "high", preferFullBleed: "low", imageEmphasis: "low" },
});
assert.ok((denseHtml.match(/class="mosaic-row"/g) || []).length >= 2, "8-up mosaic renders two table rows");
assert.ok((denseHtml.match(/class="mosaic-cell"/g) || []).length >= 8, "8-up mosaic renders eight cells");
assert.ok(denseHtml.includes('width:25') || denseHtml.includes("width:25%"), "4-across cells use 25% width");

const longDay = "Llegamos temprano al mercado y paseamos sin prisa. ".repeat(20);
const wideHtml = buildPrintHtml({
  travel: {
    id: "t-wide",
    title: "Crónica larga",
    startDate: null,
    endDate: null,
    journalMarkdown: `## Día 1\n\n${longDay}`,
  },
  users: [{ alias: "Ana" }],
  photos: [
    lowScorePhoto("w1", 1),
    { ...lowScorePhoto("w2", 1), highlightScore: 9 },
    lowScorePhoto("w3", 1),
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
assert.ok(
  /class="[^"]*divider-intro--(wide|columns|xl)/.test(wideHtml),
  "long day summary uses a wider or two-column text layout"
);
assert.ok(
  /class="[^"]*page-divider--prose/.test(wideHtml) ||
    /class="[^"]*divider-intro--(wide|columns)/.test(wideHtml),
  "substantial day prose top-aligns / fills the page"
);
assert.ok(wideHtml.includes("page-bleed") || wideHtml.includes("bleed-photo"), "single leftover photos are full-bleed");

// Four low-score photos must NOT become a half-empty one-row mosaic
const fourPages = planPdfPages({
  travel: { id: "t4", title: "Cuatro", startDate: null, endDate: null, journalMarkdown: null },
  users: [{ alias: "Ana" }],
  photos: Array.from({ length: 4 }, (_, i) => lowScorePhoto(`f${i + 1}`, 1)),
  notes: [],
  format: "a4-landscape",
  template: "classic",
  pdfDirectives: { mosaicBias: "high", preferFullBleed: "low", imageEmphasis: "low" },
});
assert.ok(
  !fourPages.some((p) => p.kind === "mosaic"),
  "four small photos do not create a single-row mosaic"
);

// Six low-score photos → one 2×3 mosaic
const sixPages = planPdfPages({
  travel: { id: "t6", title: "Seis", startDate: null, endDate: null, journalMarkdown: null },
  users: [{ alias: "Ana" }],
  photos: Array.from({ length: 6 }, (_, i) => lowScorePhoto(`s${i + 1}`, 1)),
  notes: [],
  format: "a4-landscape",
  template: "classic",
  pdfDirectives: { mosaicBias: "high", preferFullBleed: "low", imageEmphasis: "low" },
});
const sixMosaics = sixPages.filter((p) => p.kind === "mosaic");
assert.ok(sixMosaics.some((p) => (p.photos?.length ?? 0) === 6), "six small photos pack as 2×3 mosaic");

const sixHtml = buildPrintHtml({
  travel: { id: "t6h", title: "Seis HTML", startDate: null, endDate: null, journalMarkdown: null },
  users: [{ alias: "Ana" }],
  photos: Array.from({ length: 6 }, (_, i) => lowScorePhoto(`sh${i + 1}`, 1)),
  notes: [],
  format: "a4-landscape",
  template: "dark-magazine",
  pdfDirectives: { mosaicBias: "high", preferFullBleed: "low", imageEmphasis: "low" },
});
assert.ok((sixHtml.match(/class="mosaic-row"/g) || []).length === 2, "6-up mosaic renders two rows (not a lone row of 3)");
assert.ok((sixHtml.match(/class="mosaic-frame"/g) || []).length === 6, "6-up mosaic uses fill frames");
assert.ok(sixHtml.includes("object-fit: cover"), "photos use cover (no letterbox bars)");
assert.ok(sixHtml.includes(".bleed-photo") && sixHtml.includes("position: absolute"), "full-bleed photo is absolute fill");
assert.ok(!sixHtml.includes(".page-bleed { background: #000"), "bleed page is not solid black under photos");
assert.ok(
  !sixHtml.match(/page-mosaic[\s\S]*?(?:mosaic-cell(?!--empty))[\s\S]*?<\/tr>\s*<\/tbody>/) ||
    (sixHtml.match(/class="mosaic-row"/g) || []).length >= 2,
  "mosaic pages always have both rows"
);

// Three leftover photos must never become a 3-up mosaic
const threePages = planPdfPages({
  travel: { id: "t3", title: "Tres", startDate: null, endDate: null, journalMarkdown: null },
  users: [{ alias: "Ana" }],
  photos: Array.from({ length: 3 }, (_, i) => lowScorePhoto(`t${i + 1}`, 1)),
  notes: [],
  format: "a4-landscape",
  template: "classic",
  pdfDirectives: { mosaicBias: "high", preferFullBleed: "low", imageEmphasis: "low" },
});
assert.ok(!threePages.some((p) => p.kind === "mosaic"), "three photos never form a mosaic page");
assert.ok(
  threePages.every((p) => !p.photos || p.photos.length !== 3 || p.kind === "day-divider"),
  "no page carries exactly three photos"
);
const threePhotoCounts = threePages
  .filter((p) => p.photos?.length)
  .map((p) => p.photos.length);
assert.ok(
  threePhotoCounts.every((n) => n === 1 || n === 2),
  `leftover photos use bleed/pair only (got ${threePhotoCounts.join(",")})`
);


// Day divider fill: short stays chapter-card; long uses two columns (not font-stretch)
const shortDayText = "Mañana tranquila en el puerto.";
const shortDayHtml = buildPrintHtml({
  travel: {
    id: "t-short-day",
    title: "Día corto",
    startDate: null,
    endDate: null,
    journalMarkdown: `## Día 1\n\n${shortDayText}`,
  },
  users: [{ alias: "Ana" }],
  photos: [lowScorePhoto("sd1", 1), lowScorePhoto("sd2", 1), lowScorePhoto("sd3", 1)],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
assert.ok(
  shortDayHtml.includes('class="divider-intro divider-intro--short"') ||
    shortDayHtml.includes("divider-intro--short"),
  "short day text uses chapter-card layout"
);
assert.ok(
  !/class="[^"]*divider-intro--columns/.test(shortDayHtml),
  "short day text is not two-column"
);
assert.ok(
  !/class="[^"]*page-divider--prose/.test(shortDayHtml),
  "short chapter card stays vertically centered"
);

const longColumnsText = ("Paseamos sin prisa por el casco antiguo y paramos en cada plaza. ").repeat(16);
assert.ok(longColumnsText.length >= 480, "fixture is long enough for columns");
const longDayHtml = buildPrintHtml({
  travel: {
    id: "t-long-day",
    title: "Día largo",
    startDate: null,
    endDate: null,
    journalMarkdown: `## Día 1\n\n${longColumnsText}`,
  },
  users: [{ alias: "Ana" }],
  photos: [lowScorePhoto("ld1", 1), lowScorePhoto("ld2", 1), lowScorePhoto("ld3", 1)],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
assert.ok(
  /class="[^"]*divider-intro--columns/.test(longDayHtml),
  "long day text uses two columns"
);
assert.ok(
  /class="[^"]*page-divider--prose/.test(longDayHtml),
  "long day prose page is top-aligned"
);
assert.ok(
  longDayHtml.includes("column-count: 2") || longDayHtml.includes("column-count:2"),
  "CSS declares two columns for long day text"
);

console.log("export-pdf ok");
