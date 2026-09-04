import assert from "node:assert/strict";
import {
  assembleJournalMarkdown,
  buildLocalJournalMarkdown,
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

const markdown = assembleJournalMarkdown(
  ctx,
  "Intro del viaje.",
  [{ date: "2026-08-01", summary: "Día de playa." }],
  [{ url: "/uploads/a.jpg", caption: "Oleaje suave" }],
  "Fin del viaje."
);

assert.match(markdown, /# Test Trip/);
assert.match(markdown, /!\[Oleaje suave\]\(\/uploads\/a\.jpg\)/);
assert.match(markdown, /Intro del viaje/);

const local = buildLocalJournalMarkdown(ctx);
assert.match(local, /sin IA/i);
assert.match(local, /Test Trip/);

console.log("journal-pipeline assemble/local ok");
