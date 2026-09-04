import assert from "node:assert/strict";
import {
  buildDirectRouteGeometry,
  buildFlightLegs,
  buildRouteNodesFromPhotosAndPlaces,
  coalesceRouteNodes,
  filterGeometryByScope,
  hasFlightOverview,
  hasLocalActivity,
  partitionSegmentedRouteGeometry,
  resolveSegmentedRoute,
  resolveSegmentedRouteGeometry,
  shouldShowDualMaps,
  splitGroundRuns,
  splitGroundRunsByDay,
} from "../src/lib/mapbox-route.ts";

// Trip without ida/vuelta spanning two days
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
      {
        latitude: 40.41,
        longitude: -3.705,
        exifDateTime: "2024-06-03T16:00:00Z",
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
assert.equal(groundRuns.length, 2, "one ground run per calendar day");

const dayRuns = splitGroundRunsByDay(groundOnlyNodes);
assert.equal(dayRuns.length, 2, "two colored day runs");
assert.notEqual(dayRuns[0].color, dayRuns[1].color, "days use different colors");
assert.ok(dayRuns[0].label.includes("Día 1"));
assert.ok(dayRuns[1].label.includes("Día 2"));

const direct = buildDirectRouteGeometry(groundOnlyNodes);
assert.ok(direct, "direct geometry without flights");
assert.equal(direct.flightLegs.length, 0);
assert.equal(direct.roadSegments.length, 2);
assert.equal(direct.dayLegend.length, 2);
assert.equal(direct.mode, "direct");

const segmented = await resolveSegmentedRoute(groundOnlyNodes);
assert.ok(segmented, "segmented route without flights");
assert.equal(segmented.flightPolylines.length, 0);
assert.equal(segmented.roadPolylines.length, 2);
assert.equal(segmented.coloredRoads.length, 2);
assert.ok(
  segmented.mode === "directions" || segmented.mode === "direct",
  `mode should be directions or direct, got ${segmented.mode}`
);

const geometry = await resolveSegmentedRouteGeometry(groundOnlyNodes);
assert.ok(geometry, "decoded geometry");
assert.equal(geometry.flightLegs.length, 0);
assert.ok(geometry.roadSegments[0].coordinates.length >= 2);
assert.ok(geometry.roadSegments[0].color);

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

assert.equal(hasFlightOverview(idaGeometry), true);
assert.equal(hasLocalActivity(idaGeometry), true);
assert.equal(shouldShowDualMaps(idaGeometry), true);
assert.equal(shouldShowDualMaps(direct), false, "ground-only trip stays single map");

const parts = partitionSegmentedRouteGeometry(idaGeometry);
assert.equal(parts.flights.flightLegs.length, 1);
assert.equal(parts.flights.roadSegments.length, 0);
assert.equal(parts.local.flightLegs.length, 0);
assert.equal(parts.local.roadSegments.length, 1);
assert.equal(filterGeometryByScope(idaGeometry, "flights")?.flightLegs.length, 1);
assert.equal(filterGeometryByScope(idaGeometry, "local")?.roadSegments.length, 1);
assert.equal(filterGeometryByScope(idaGeometry, "all"), idaGeometry);

// Long-haul: MAD → KRK style should dual-map
const longHaul = coalesceRouteNodes(
  buildRouteNodesFromPhotosAndPlaces([
    {
      latitude: 40.4719,
      longitude: -3.5626,
      exifDateTime: "2024-06-01T08:00:00Z",
      isTransportStart: true,
    },
    {
      latitude: 50.0777,
      longitude: 19.7981,
      exifDateTime: "2024-06-01T12:00:00Z",
    },
    {
      latitude: 50.0614,
      longitude: 19.9372,
      exifDateTime: "2024-06-02T10:00:00Z",
    },
    {
      latitude: 50.0647,
      longitude: 19.945,
      exifDateTime: "2024-06-03T11:00:00Z",
    },
    {
      latitude: 50.0777,
      longitude: 19.7981,
      exifDateTime: "2024-06-04T18:00:00Z",
      isTransportEnd: true,
    },
  ])
);
const longHaulGeometry = await resolveSegmentedRouteGeometry(longHaul);
assert.ok(longHaulGeometry);
assert.ok(longHaulGeometry.flightLegs.length >= 1);
assert.ok(longHaulGeometry.roadSegments.length >= 1);
assert.equal(shouldShowDualMaps(longHaulGeometry), true);

console.log("map-routes ok", {
  groundOnly: segmented.mode,
  dayColors: dayRuns.map((r) => r.color),
  idaOnly: idaGeometry.mode,
  roadPoints: geometry.roadSegments[0].coordinates.length,
  dualMaps: shouldShowDualMaps(longHaulGeometry),
});
