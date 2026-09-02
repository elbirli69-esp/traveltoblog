import assert from "node:assert/strict";
import { buildPrintHtml, planPdfPages } from "../src/lib/export-pdf-layout.ts";

const html = buildPrintHtml({
  travel: {
    id: "t1",
    title: "Viaje prueba",
    startDate: new Date("2024-06-01"),
    endDate: new Date("2024-06-05"),
    journalMarkdown: "## Día 1\n\nLlegamos al aeropuerto.\n\n## Día 2\n\nPaseo por el centro.",
  },
  users: [{ id: "u1", alias: "Ana", email: null, createdAt: new Date(), updatedAt: new Date() }],
  photos: [
    {
      id: "p1",
      url: "/x",
      filename: "001.jpg",
      imagePath: "photos/001.jpg",
      latitude: 40.4,
      longitude: -3.7,
      exifDateTime: new Date("2024-06-02"),
      alias: "Ana",
      placeName: "Madrid",
      highlightScore: 9,
      notes: ["Qué vista"],
    },
  ],
  notes: [],
  format: "a4-landscape",
});

assert.ok(html.includes('src="photos/001.jpg"'), "relative image path");
assert.ok(html.includes("page-cover"), "cover page");
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
});
assert.ok(pages.some((p) => p.kind === "pair"), "pairs low-score same-day photos");

console.log("export-pdf ok");
