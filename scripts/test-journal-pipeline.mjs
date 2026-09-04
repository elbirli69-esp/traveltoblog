import assert from "node:assert/strict";
import {
  assembleJournalMarkdown,
  buildLocalJournalMarkdown,
  sanitizeDaySummaryProse,
  sanitizeJournalDayProse,
} from "../src/lib/journal-pipeline.ts";

const ctx = {
  title: "Test Trip",
  participants: ["Ada"],
  dateRange: { start: "2026-08-01", end: "2026-08-02" },
  flights: { outbound: null, inbound: null },
  places: [],
  tripNotes: [{ text: "Primera nota", author: "Ada" }],
  brief: null,
  days: [
    {
      date: "2026-08-01",
      dayNotes: [{ text: "Playa", author: "Ada" }],
      places: [],
      photos: [
        {
          url: "/uploads/a.jpg",
          author: "Ada",
          comments: ["Oleaje"],
          exifDateTime: "2026-08-01T12:00:00.000Z",
          isTransportStart: false,
          isTransportEnd: false,
        },
      ],
    },
  ],
};

assert.equal(
  sanitizeDaySummaryProse('Pasamos la mañana en la plaza.\n\n> "Flipé con el tamaño"\n\nLuego comimos.'),
  "Pasamos la mañana en la plaza.\n\nLuego comimos."
);
assert.ok(!sanitizeDaySummaryProse('Ada: "Hola literal"\n\nSeguimos.').includes("Hola literal"));

const dirtyDay = `### lunes, 1 de agosto de 2026

Irene estaba feliz.

> **Irene:** Plaza medieval enorme

![Foto](/x.jpg)

*Irene*
`;
const cleaned = sanitizeJournalDayProse(dirtyDay);
assert.ok(cleaned.includes("Irene estaba feliz"));
assert.ok(!cleaned.includes("Plaza medieval enorme"));
assert.ok(cleaned.includes("![Foto](/x.jpg)"), "images preserved");

const markdown = assembleJournalMarkdown(
  ctx,
  "Intro del viaje.",
  [
    {
      date: "2026-08-01",
      summary: 'Día de playa.\n\n> "Oleaje brutal"\n\nAda: "Qué frío"',
    },
  ],
  [{ url: "/uploads/a.jpg", caption: "Oleaje suave" }],
  "Fin del viaje."
);

assert.match(markdown, /# Test Trip/);
assert.match(markdown, /!\[Oleaje suave\]\(\/uploads\/a\.jpg\)/);
assert.match(markdown, /Intro del viaje/);
assert.match(markdown, /Día de playa/);
assert.ok(!markdown.includes("Oleaje brutal"), "no literal photo quote in day prose");
assert.ok(!markdown.includes('Ada: "Qué frío"'), "no author:quote dump");

const local = buildLocalJournalMarkdown(ctx);
assert.match(local, /sin IA/i);
assert.match(local, /Test Trip/);

console.log("journal-pipeline assemble/local ok");
