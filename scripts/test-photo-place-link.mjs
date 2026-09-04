import assert from "node:assert/strict";
import {
  matchPhotoToPlaceId,
  planPhotoPlaceLinks,
  summarizeUnlinkedPhotos,
} from "../src/lib/photo-place-link.ts";
import { buildExportWarnings } from "../src/lib/export-warnings.ts";

const places = [
  { id: "p1", latitude: 40.4168, longitude: -3.7038 },
  { id: "p2", latitude: 41.3851, longitude: 2.1734 },
];

const nearMadrid = {
  id: "ph1",
  latitude: 40.4169,
  longitude: -3.7037,
  placeId: null,
  isTransportStart: false,
  isTransportEnd: false,
};

assert.equal(matchPhotoToPlaceId(nearMadrid, places), "p1");
assert.equal(
  matchPhotoToPlaceId({ ...nearMadrid, placeId: "existing" }, places),
  null
);
assert.equal(
  matchPhotoToPlaceId({ ...nearMadrid, isTransportStart: true }, places),
  null
);
assert.equal(
  matchPhotoToPlaceId({ ...nearMadrid, latitude: null, longitude: null }, places),
  null
);

const plan = planPhotoPlaceLinks(
  [
    nearMadrid,
    {
      id: "ph2",
      latitude: 41.3852,
      longitude: 2.1735,
      placeId: null,
      isTransportStart: false,
      isTransportEnd: false,
    },
    {
      id: "ph3",
      latitude: 0,
      longitude: 0,
      placeId: null,
      isTransportStart: false,
      isTransportEnd: false,
    },
  ],
  places
);
assert.equal(plan.get("ph1"), "p1");
assert.equal(plan.get("ph2"), "p2");
assert.equal(plan.has("ph3"), false);

const summary = summarizeUnlinkedPhotos(
  [
    nearMadrid,
    {
      id: "ph-linked",
      latitude: 40.4168,
      longitude: -3.7038,
      placeId: "p1",
      isTransportStart: false,
      isTransportEnd: false,
    },
  ],
  places
);
assert.equal(summary.unlinked, 1);
assert.equal(summary.matchable, 1);
assert.equal(summary.withGpsFar, 0);
assert.equal(summary.withoutGps, 0);

const summaryMixed = summarizeUnlinkedPhotos(
  [
    nearMadrid,
    {
      id: "ph-far",
      latitude: 48.8566,
      longitude: 2.3522,
      placeId: null,
      isTransportStart: false,
      isTransportEnd: false,
    },
    {
      id: "ph-nogps",
      latitude: null,
      longitude: null,
      placeId: null,
      isTransportStart: false,
      isTransportEnd: false,
    },
  ],
  places
);
assert.equal(summaryMixed.unlinked, 3);
assert.equal(summaryMixed.matchable, 1);
assert.equal(summaryMixed.withGpsFar, 1);
assert.equal(summaryMixed.withoutGps, 1);

const warnings = buildExportWarnings({
  startDate: new Date("2024-06-01"),
  endDate: new Date("2024-06-05"),
  journalMarkdown: "# Viaje",
  placeCount: 2,
  photos: [
    {
      latitude: 40.4168,
      longitude: -3.7038,
      exifDateTime: new Date("2024-06-02"),
      placeId: null,
      isTransportStart: false,
      isTransportEnd: false,
    },
    {
      latitude: 40.4168,
      longitude: -3.7038,
      exifDateTime: new Date("2024-06-03"),
      placeId: "p1",
      isTransportStart: false,
      isTransportEnd: false,
    },
  ],
  notes: [],
});
assert.ok(
  warnings.some((w) => w.message.includes("sin lugar vinculado")),
  "expected unlinked place warning"
);

console.log("photo-place-link ok");
