import assert from "node:assert/strict";
import {
  buildFlightLegs,
  encodePolyline,
  resolveSegmentedRoute,
  splitGroundRuns,
} from "../src/lib/mapbox-route.ts";
import { buildPdfMapStaticUrlFromPhotos } from "../src/lib/export-pdf-map.ts";

const madridGround = [
  {
    id: "g1",
    url: "",
    filename: "",
    imagePath: "",
    bleedImagePath: "",
    latitude: 40.42,
    longitude: -3.69,
    exifDateTime: new Date("2024-06-02T10:00:00Z"),
    alias: "A",
    notes: [],
  },
  {
    id: "g2",
    url: "",
    filename: "",
    imagePath: "",
    bleedImagePath: "",
    latitude: 40.43,
    longitude: -3.68,
    exifDateTime: new Date("2024-06-02T14:00:00Z"),
    alias: "A",
    notes: [],
  },
];

const photos = [
  {
    id: "ida",
    url: "",
    filename: "",
    imagePath: "",
    bleedImagePath: "",
    latitude: 40.4719,
    longitude: -3.5626,
    exifDateTime: new Date("2024-06-01T08:00:00Z"),
    alias: "A",
    notes: [],
    isTransportStart: true,
    isTransportEnd: false,
  },
  ...madridGround,
  {
    id: "vuelta",
    url: "",
    filename: "",
    imagePath: "",
    bleedImagePath: "",
    latitude: 40.4719,
    longitude: -3.5626,
    exifDateTime: new Date("2024-06-05T18:00:00Z"),
    alias: "A",
    notes: [],
    isTransportStart: false,
    isTransportEnd: true,
  },
];

const nodes = [
  { lng: -3.5626, lat: 40.4719, kind: "transport-out", at: "2024-06-01T08:00:00Z" },
  { lng: -3.69, lat: 40.42, kind: "ground", at: "2024-06-02T10:00:00Z" },
  { lng: -3.68, lat: 40.43, kind: "ground", at: "2024-06-02T14:00:00Z" },
  { lng: -3.5626, lat: 40.4719, kind: "transport-in", at: "2024-06-05T18:00:00Z" },
] ;

const groundRuns = splitGroundRuns(nodes);
assert.equal(groundRuns.length, 1, "one ground run between flights");
assert.equal(groundRuns[0].length, 2);

const flightLegs = buildFlightLegs(nodes);
assert.equal(flightLegs.length, 2, "ida→ground and ground→vuelta");
assert.ok(flightLegs.some((leg) => leg[0].lng === -3.5626), "flight leg from airport");

const segmented = await resolveSegmentedRoute(nodes);
assert.ok(segmented, "segmented route");
assert.equal(segmented.roadPolylines.length, 1, "one road polyline");
assert.ok(segmented.flightPolylines.length >= 2, "flight polylines for ida/vuelta");
assert.ok(segmented.mode === "segmented" || segmented.mode === "directions");

const roadOnly = encodePolyline(groundRuns[0]);
assert.notEqual(segmented.roadPolylines[0], roadOnly, "road uses directions not straight line");

const url = await buildPdfMapStaticUrlFromPhotos(photos, []);
assert.ok(url, "static map url built");
assert.ok(url.includes("path-6"), "road path overlay");
assert.ok(url.includes("path-4"), "flight path overlay");
assert.ok(url.includes("818cf8"), "flight color");
assert.ok(url.includes("/auto/"), "auto viewport");

const res = await fetch(url);
assert.equal(res.status, 200, "mapbox static returns 200");
const bytes = (await res.arrayBuffer()).byteLength;
assert.ok(bytes > 100_000, `map image substantial (${bytes} bytes)`);

console.log("export-pdf-map ok", segmented.mode, bytes);
