import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "../src/lib/timeline.ts";

test("buildTimeline orders events on same day", () => {
  const result = buildTimeline({
    photos: [
      {
        id: "p1",
        url: "/a.jpg",
        exifDateTime: "2025-08-10T10:00:00.000Z",
        latitude: 40.4,
        longitude: -3.7,
        isTransportStart: false,
        isTransportEnd: false,
        alias: "Ana",
      },
    ],
    places: [
      {
        id: "pl1",
        name: "Museo",
        type: "MUSEUM",
        latitude: 40.41,
        longitude: -3.69,
        visitedAt: "2025-08-10T14:00:00.000Z",
        createdAt: "2025-08-10T12:00:00.000Z",
        alias: "Ana",
      },
    ],
    notes: [
      {
        id: "n1",
        type: "DAY",
        text: "Gran día",
        dayDate: "2025-08-10T00:00:00.000Z",
        photoId: null,
        placeId: null,
        createdAt: "2025-08-10T08:00:00.000Z",
        alias: "Ana",
      },
    ],
  });

  const kinds = result.events.filter((e) => e.kind !== "day-boundary").map((e) => e.kind);
  assert.ok(kinds.includes("photo"));
  assert.ok(kinds.includes("place"));
  assert.ok(kinds.includes("note"));
  assert.equal(result.meta.hasGps, true);
});

test("buildTimeline includes flight events", () => {
  const result = buildTimeline({
    photos: [
      {
        id: "out",
        url: "/out.jpg",
        exifDateTime: "2025-08-01T08:00:00.000Z",
        latitude: 40.5,
        longitude: -3.6,
        isTransportStart: true,
        isTransportEnd: false,
        alias: "Ana",
      },
    ],
    places: [],
    notes: [],
  });
  assert.ok(result.events.some((e) => e.kind === "flight-out"));
});
