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
assert.ok(clampPdfNote("x".repeat(200)).endsWith("…"));
assert.ok(clampPdfNote("x".repeat(200)).length <= 151);

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
  "Esta es una nota muy larga sobre la foto que antes se metía en una columna de crónica y atravesaba varias páginas del álbum impreso sin control visual alguno.";
assert.ok(photoNoteCaption({ ...basePhoto, id: "n", notes: [longNote] }).endsWith("…"));
assert.ok(photoNoteCaption({ ...basePhoto, id: "n", notes: [longNote] }).length <= 151);

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
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
assert.ok(pages.some((p) => p.kind === "mosaic"), "busy day uses mosaic");
assert.ok(
  pages.filter((p) => p.kind === "featured").every((p) => !p.narrative && !p.quote),
  "featured pages carry no journal narrative"
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
`;

const extracted = extractPdfDayNarratives(journalLike);
assert.equal(extracted.ordered.length, 2);
assert.ok(extracted.byTitle.get(dayA.toLowerCase())?.includes("Plaza del Mercado"));
assert.ok(extracted.byTitle.get(dayB.toLowerCase())?.includes("Segundo día"));
assert.ok(!extracted.ordered.join("").includes("Foto de Irene"));
assert.ok(!extracted.ordered.join("").includes("Foto de Rodri"));
assert.ok(!extracted.ordered.join("").includes("<img"));

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
      highlightScore: 5,
      notes: [],
      exifDateTime: new Date("2024-06-02T12:00:00Z"),
    },
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
const divider = pollutedPages.find((p) => p.kind === "day-divider");
assert.ok(divider?.narrative?.includes("Plaza del Mercado"), "day prose on divider");
assert.ok(!divider?.narrative?.includes("Foto de Irene"), "no image alt dump");
assert.ok(!divider?.narrative?.includes("Lugares del recorrido"), "skip lugares section");

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
      highlightScore: 5,
      notes: [],
    },
  ],
  notes: [],
  format: "a4-landscape",
  template: "classic",
});
assert.ok(!pollutedHtml.includes("Foto de Irene"), "HTML has no alt-text column");
assert.ok(pollutedHtml.includes("divider-intro img"), "CSS hides leftover imgs");

console.log("export-pdf ok");
