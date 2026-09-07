import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDaySummaryContext,
  collectDaySummaryInputs,
  heuristicDaySummary,
  isDaySummaryEmpty,
  parseDayKey,
  sanitizeDaySummaryText,
} from "../src/lib/ai-suggest-day-summary.ts";

test("parseDayKey validates YYYY-MM-DD", () => {
  assert.equal(parseDayKey("2026-06-11"), "2026-06-11");
  assert.equal(parseDayKey("11/06/2026"), null);
});

test("empty day skips AI path via heuristic", () => {
  const ctx = buildDaySummaryContext({
    travelTitle: "Krakow",
    dayKey: "2026-06-11",
    authorAlias: "Irene",
    photoCount: 0,
    places: [],
    noteBullets: [],
    journalBrief: null,
  });
  assert.equal(isDaySummaryEmpty(ctx), true);
  assert.match(heuristicDaySummary(ctx), /Sin actividad/);
});

test("collectDaySummaryInputs filters by dayKey", () => {
  const collected = collectDaySummaryInputs({
    dayKey: "2026-06-11",
    photos: [
      {
        exifDateTime: "2026-06-11T10:00:00.000Z",
        place: { name: "Wawel", type: "VIEWPOINT" },
        notes: [{ type: "PHOTO", text: "Muralla impresionante" }],
      },
      {
        exifDateTime: "2026-06-12T10:00:00.000Z",
        place: { name: "Otro", type: "OTHER" },
        notes: [],
      },
    ],
    places: [
      {
        name: "Plaza",
        type: "OTHER",
        visitedAt: "2026-06-11T15:00:00.000Z",
        notes: [{ type: "PLACE", text: "Helado" }],
      },
    ],
    dayNotes: [
      { text: "Gran día", dayDate: "2026-06-11T00:00:00.000Z" },
      { text: "Otro", dayDate: "2026-06-12T00:00:00.000Z" },
    ],
  });
  assert.equal(collected.photoCount, 1);
  assert.ok(collected.places.some((p) => p.name === "Wawel"));
  assert.ok(collected.places.some((p) => p.name === "Plaza"));
  assert.ok(collected.noteBullets.some((b) => /Muralla|Gran día|Helado/.test(b)));
});

test("sanitizeDaySummaryText strips prefix", () => {
  assert.equal(
    sanitizeDaySummaryText("Resumen del día: Hola Krakow"),
    "Hola Krakow"
  );
});

test("heuristic mentions places", () => {
  const ctx = buildDaySummaryContext({
    travelTitle: "Krakow",
    dayKey: "2026-06-11",
    authorAlias: "Irene",
    photoCount: 3,
    places: [{ name: "Wawel", type: "VIEWPOINT" }],
    noteBullets: ["Callejeamos"],
    journalBrief: null,
  });
  const text = heuristicDaySummary(ctx);
  assert.match(text, /Wawel/);
  assert.match(text, /3 foto/);
});
