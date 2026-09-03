import assert from "node:assert/strict";
import {
  buildDirectRouteGeometry,
  buildFlightLegs,
  buildRouteNodesFromPhotosAndPlaces,
  coalesceRouteNodes,
  resolveSegmentedRoute,
  resolveSegmentedRouteGeometry,
  splitGroundRuns,
} from "../src/lib/mapbox-route.ts";

// Trip without ida/vuelta: only ground photos + a place
const groundOnlyNodes = coalesceRouteNodes(
  buildRouteNodesFromPhotosAndPlaces(
    [
      {
        latitude: 40.42,
        longitude: -3.69,
        exifDateTime: "2024-06-02T10:00:00Z",
      },
      {
        latitude: 40.43,
        longitude: -3.68,
        exifDateTime: "2024-06-02T14:00:00Z",
      },
      {
        latitude: 40.415,
        longitude: -3.71,
        exifDateTime: "2024-06-03T11:00:00Z",
      },
    ],
    [
      {
        latitude: 40.425,
        longitude: -3.70,
        visitedAt: "2024-06-02T12:00:00Z",
      },
    ]
  )
);

assert.equal(groundOnlyNodes.every((n) => n.kind === "ground"), true);
assert.equal(buildFlightLegs(groundOnlyNodes).length, 0, "no flights without transport markers");

const groundRuns = splitGroundRuns(groundOnlyNodes);
assert.equal(groundRuns.length, 1, "single ground run for whole trip");
assert.ok(groundRuns[0].length >= 3, "photos + place in one run");

const direct = buildDirectRouteGeometry(groundOnlyNodes);
assert.ok(direct, "direct geometry without flights");
assert.equal(direct.flightLegs.length, 0);
assert.equal(direct.roadSegments.length, 1);
assert.equal(direct.mode, "direct");

const segmented = await resolveSegmentedRoute(groundOnlyNodes);
assert.ok(segmented, "segmented route without flights");
assert.equal(segmented.flightPolylines.length, 0);
assert.equal(segmented.roadPolylines.length, 1);
assert.ok(
  segmented.mode === "directions" || segmented.mode === "direct",
  `mode should be directions or direct, got ${segmented.mode}`
);

const geometry = await resolveSegmentedRouteGeometry(groundOnlyNodes);
assert.ok(geometry, "decoded geometry");
assert.equal(geometry.flightLegs.length, 0);
assert.ok(geometry.roadSegments[0].length >= 2);

// Optional ida only (no vuelta): still get ground + one flight leg
const idaOnly = coalesceRouteNodes(
  buildRouteNodesFromPhotosAndPlaces([
    {
      latitude: 40.4719,
      longitude: -3.5626,
      exifDateTime: "2024-06-01T08:00:00Z",
      isTransportStart: true,
    },
    {
      latitude: 40.42,
      longitude: -3.69,
      exifDateTime: "2024-06-02T10:00:00Z",
    },
    {
      latitude: 40.43,
      longitude: -3.68,
      exifDateTime: "2024-06-02T14:00:00Z",
    },
  ])
);
const idaLegs = buildFlightLegs(idaOnly);
assert.equal(idaLegs.length, 1, "ida→first ground as one flight leg");
assert.equal(splitGroundRuns(idaOnly).length, 1, "ground run after ida");

const idaGeometry = await resolveSegmentedRouteGeometry(idaOnly);
assert.ok(idaGeometry);
assert.equal(idaGeometry.flightLegs.length, 1);
assert.equal(idaGeometry.roadSegments.length, 1);

console.log("map-routes ok", {
  groundOnly: segmented.mode,
  idaOnly: idaGeometry.mode,
  roadPoints: geometry.roadSegments[0].length,
});
