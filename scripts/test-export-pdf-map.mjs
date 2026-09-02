import assert from "node:assert/strict";
import { encodePolyline, resolveRoutePolyline } from "../src/lib/mapbox-route.ts";
import { buildPdfMapStaticUrlFromPhotos } from "../src/lib/export-pdf-map.ts";

const photos = [
  {
    id: "1",
    url: "",
    filename: "",
    imagePath: "",
    bleedImagePath: "",
    latitude: 40.4168,
    longitude: -3.7038,
    exifDateTime: new Date("2024-06-01"),
    alias: "A",
    notes: [],
  },
  {
    id: "2",
    url: "",
    filename: "",
    imagePath: "",
    bleedImagePath: "",
    latitude: 40.42,
    longitude: -3.69,
    exifDateTime: new Date("2024-06-02"),
    alias: "A",
    notes: [],
  },
  {
    id: "3",
    url: "",
    filename: "",
    imagePath: "",
    bleedImagePath: "",
    latitude: 40.43,
    longitude: -3.68,
    exifDateTime: new Date("2024-06-03"),
    alias: "A",
    notes: [],
  },
];

const waypoints = photos.map((p) => ({ lng: p.longitude, lat: p.latitude }));
const route = await resolveRoutePolyline(waypoints);
assert.ok(route, "route polyline resolved");
assert.ok(route.polyline.length > 10, "encoded polyline non-trivial");

const enc = encodePolyline(waypoints);
assert.notEqual(enc, route.polyline, "directions polyline differs from straight line");

const url = buildPdfMapStaticUrlFromPhotos(photos, [], route.polyline);
assert.ok(url, "static map url built");
assert.ok(url.includes("path-6"), "path overlay present");
assert.ok(url.includes("%"), "polyline is uri-encoded");
assert.ok(url.includes("/auto/"), "auto viewport");

const res = await fetch(url);
assert.equal(res.status, 200, "mapbox static returns 200");
const bytes = (await res.arrayBuffer()).byteLength;
assert.ok(bytes > 100_000, `map image substantial (${bytes} bytes)`);

console.log("export-pdf-map ok", route.mode, bytes);
