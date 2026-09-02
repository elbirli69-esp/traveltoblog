import assert from "node:assert/strict";
import { buildPrintHtml } from "../src/lib/export-pdf.ts";

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
      notes: ["Qué vista"],
    },
  ],
  notes: [],
  format: "a4-landscape",
});

assert.ok(html.includes('src="photos/001.jpg"'), "relative image path");
assert.ok(html.includes("display: table"), "table layout for WeasyPrint");
assert.ok(!html.includes("file://"), "no file:// urls");
assert.ok(html.includes("## Día 1") || html.includes("Día 1"), "journal sections");
assert.ok(html.includes("48%"), "photo column width");

console.log("export-pdf ok");
