import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBlogCompleteness,
  listPhotosWithoutNote,
} from "../src/lib/blog-completeness.ts";

test("listPhotosWithoutNote skips unselected and noted photos", () => {
  const ids = listPhotosWithoutNote([
    {
      id: "a",
      selected: true,
      exifDateTime: null,
      latitude: null,
      longitude: null,
      placeId: null,
      photoNoteCount: 0,
    },
    {
      id: "b",
      selected: true,
      exifDateTime: null,
      latitude: null,
      longitude: null,
      placeId: null,
      photoNoteCount: 1,
    },
    {
      id: "c",
      selected: false,
      exifDateTime: null,
      latitude: null,
      longitude: null,
      placeId: null,
      photoNoteCount: 0,
    },
  ]);
  assert.deepEqual(ids, ["a"]);
});

test("food_missing when multi-day trip has no cafe/restaurant", () => {
  const result = buildBlogCompleteness({
    title: "Krakow 2026",
    journalBrief: "Viaje en pareja",
    startDate: "2026-06-10T00:00:00.000Z",
    endDate: "2026-06-14T00:00:00.000Z",
    photos: Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      selected: true,
      exifDateTime: `2026-06-1${i % 4}T12:00:00.000Z`,
      latitude: 50.06,
      longitude: 19.94,
      placeId: null,
      photoNoteCount: 1,
      highlightScore: 8,
    })),
    places: [{ type: "VIEWPOINT", noteCount: 1 }],
    dayNotes: [
      { dayDate: "2026-06-10T00:00:00.000Z", textLength: 40 },
      { dayDate: "2026-06-11T00:00:00.000Z", textLength: 40 },
    ],
    tripNoteCount: 1,
    personalNoteChars: 200,
  });
  assert.ok(result.gaps.some((g) => g.code === "food_missing"));
});

test("personal_thin when most photos lack notes", () => {
  const result = buildBlogCompleteness({
    title: "Krakow 2026",
    journalBrief: null,
    startDate: null,
    endDate: null,
    photos: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      selected: true,
      exifDateTime: "2026-06-11T12:00:00.000Z",
      latitude: null,
      longitude: null,
      placeId: null,
      photoNoteCount: 0,
    })),
    places: [],
    dayNotes: [],
    tripNoteCount: 0,
    personalNoteChars: 0,
  });
  assert.ok(result.gaps.some((g) => g.code === "personal_thin"));
  assert.ok(result.score < 100);
});

test("no food_missing on short single-signal trips", () => {
  const result = buildBlogCompleteness({
    title: "Krakow",
    journalBrief: "x".repeat(20),
    startDate: "2026-06-11T00:00:00.000Z",
    endDate: "2026-06-11T00:00:00.000Z",
    photos: [
      {
        id: "p1",
        selected: true,
        exifDateTime: "2026-06-11T12:00:00.000Z",
        latitude: null,
        longitude: null,
        placeId: null,
        photoNoteCount: 2,
        highlightScore: 8,
      },
    ],
    places: [],
    dayNotes: [{ dayDate: "2026-06-11T00:00:00.000Z", textLength: 50 }],
    tripNoteCount: 1,
    personalNoteChars: 100,
  });
  assert.ok(!result.gaps.some((g) => g.code === "food_missing"));
});
