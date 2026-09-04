import assert from "node:assert/strict";
import {
  buildGpsTrailPolylines,
  selectExportGpsTracks,
  gpsTrailsHaveGeometry,
} from "../src/lib/gps-track-map.ts";

const tracks = [
  {
    id: "t1",
    includeInExport: false,
    alias: "Rodri",
    points: [
      { lat: 36.18, lng: -6.03 },
      { lat: 36.181, lng: -6.031 },
      { lat: 36.182, lng: -6.032 },
    ],
  },
  {
    id: "t2",
    includeInExport: true,
    alias: "Irene",
    points: [
      { lat: 36.29, lng: -6.14 },
      { lat: 36.291, lng: -6.141 },
    ],
  },
];

assert.equal(selectExportGpsTracks(tracks, false).length, 1);
assert.equal(selectExportGpsTracks(tracks, true).length, 2);

const trails = buildGpsTrailPolylines(selectExportGpsTracks(tracks, false));
assert.equal(trails.length, 1);
assert.equal(trails[0].id, "t2");
assert.ok(trails[0].coords.length >= 2);
assert.equal(gpsTrailsHaveGeometry(trails), true);
assert.equal(gpsTrailsHaveGeometry([]), false);

console.log("gps-track-map ok");
