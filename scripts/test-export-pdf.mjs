import assert from "node:assert/strict";
import { buildPrintHtml, planPdfPages } from "../src/lib/export-pdf-layout.ts";

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

const html = buildPrintHtml({
  travel: {
    id: "t1",
    title: "Viaje prueba",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown: "## Día 1\n\nLlegamos al aeropuerto.\n\n## Día 2\n\nPaseo por el centro.",
  },
  users: [{ alias: "Ana" }],
  photos: [{ id: "p1", ...basePhoto }],
  notes: [],
  format: "a4-landscape",
  template: "classic",
  mapImagePath: "map/route.jpg",
});

assert.ok(html.includes('src="photos/001-bleed.jpg"'), "bleed image on cover");
assert.ok(html.includes("page-cover"), "cover page");
assert.ok(html.includes("page-map"), "map page");
assert.ok(html.includes("map/route.jpg"), "map image path");
assert.ok(html.includes("page-bleed") || html.includes("page-featured"), "interior layouts");
assert.ok(!html.includes("file://"), "no file:// urls");
assert.ok(html.includes("Capítulo") || html.includes("Recuerdos"), "day divider");

const pages = planPdfPages({
  travel: {
    id: "t1",
    title: "Viaje prueba",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown: "## Día 1\n\nTexto.",
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
      notes: [],
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
  template: "minimal",
});
assert.ok(pages.some((p) => p.kind === "mosaic"), "mosaic for busy day low-score photos");
assert.ok(pages.some((p) => p.kind === "map") === false, "no map without path");

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

console.log("export-pdf ok");
