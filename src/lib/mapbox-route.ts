import { MAPBOX_TOKEN } from "@/lib/mapbox";

export interface MapRouteWaypoint {
  lng: number;
  lat: number;
}

export type MapRouteNodeKind = "ground" | "transport-out" | "transport-in";

export interface MapRouteNode extends MapRouteWaypoint {
  kind: MapRouteNodeKind;
  at: string | null;
}

export type MapRouteBuildMode = "segmented" | "directions" | "direct";

export interface SegmentedRouteResult {
  /** Encoded polylines for road overlays (Mapbox Directions). */
  roadPolylines: string[];
  /** Encoded polylines for flight/transport legs (straight). */
  flightPolylines: string[];
  mode: MapRouteBuildMode;
}

const MAX_DIRECTIONS_WAYPOINTS = 25;
const STATIC_URL_MAX_LEN = 7800;

/** Google-encoded polyline (precision 5) for Mapbox Static Images path overlay. */
export function encodePolyline(
  coordinates: MapRouteWaypoint[],
  precision = 5
): string {
  const factor = Math.pow(10, precision);
  let output = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const { lng, lat } of coordinates) {
    const ilat = Math.round(lat * factor);
    const ilng = Math.round(lng * factor);
    output += encodeSigned(ilat - prevLat);
    output += encodeSigned(ilng - prevLng);
    prevLat = ilat;
    prevLng = ilng;
  }

  return output;

  function encodeSigned(value: number): string {
    let s = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (s >= 0x20) {
      chunk += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
      s >>= 5;
    }
    chunk += String.fromCharCode(s + 63);
    return chunk;
  }
}

/** Reduce waypoints for Mapbox Directions (max 25 coordinates). */
export function simplifyWaypoints(
  points: MapRouteWaypoint[],
  maxPoints = MAX_DIRECTIONS_WAYPOINTS
): MapRouteWaypoint[] {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 2) return points.slice(0, maxPoints);

  const result: MapRouteWaypoint[] = [];
  const lastIndex = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const t = i / (maxPoints - 1);
    const index = Math.round(t * lastIndex);
    const point = points[index]!;
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.lng.toFixed(5) === point.lng.toFixed(5) &&
      prev.lat.toFixed(5) === point.lat.toFixed(5)
    ) {
      continue;
    }
    result.push(point);
  }
  return result;
}

function isTransportKind(kind: MapRouteNodeKind): boolean {
  return kind === "transport-out" || kind === "transport-in";
}

/** Split timeline into consecutive ground runs (between transport markers). */
export function splitGroundRuns(nodes: MapRouteNode[]): MapRouteWaypoint[][] {
  const runs: MapRouteWaypoint[][] = [];
  let current: MapRouteWaypoint[] = [];

  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (const node of nodes) {
    if (isTransportKind(node.kind)) {
      flush();
      continue;
    }
    current.push({ lng: node.lng, lat: node.lat });
  }
  flush();
  return runs;
}

/** Flight/transport legs: straight lines adjacent to ida/vuelta markers. */
export function buildFlightLegs(nodes: MapRouteNode[]): MapRouteWaypoint[][] {
  const legs: MapRouteWaypoint[][] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    if (!isTransportKind(a.kind) && !isTransportKind(b.kind)) continue;
    legs.push([
      { lng: a.lng, lat: a.lat },
      { lng: b.lng, lat: b.lat },
    ]);
  }
  return legs;
}

/** Fetch road-following route geometry from Mapbox Directions API. */
export async function fetchMapboxDirectionsPolyline(
  waypoints: MapRouteWaypoint[],
  profile: "driving" | "walking" = "driving"
): Promise<string | null> {
  const token = MAPBOX_TOKEN;
  if (!token || waypoints.length < 2) return null;

  const simplified = simplifyWaypoints(waypoints);
  const coordPath = simplified.map((p) => `${p.lng},${p.lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordPath}` +
    `?geometries=polyline&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: { geometry?: string }[];
      code?: string;
    };
    const geometry = data.routes?.[0]?.geometry;
    return geometry && geometry.length > 0 ? geometry : null;
  } catch {
    return null;
  }
}

export function buildPathOverlay(
  encodedPolyline: string,
  options?: { width?: number; color?: string; opacity?: number }
): string {
  const width = options?.width ?? 6;
  const color = options?.color ?? "0a84ff";
  const opacity = options?.opacity ?? 0.95;
  const enc = encodeURIComponent(encodedPolyline);
  return `path-${width}+${color}-${opacity}(${enc})`;
}

export function buildRoutePathOverlay(encodedPolyline: string): string {
  return buildPathOverlay(encodedPolyline);
}

export function buildFlightPathOverlay(encodedPolyline: string): string {
  return buildPathOverlay(encodedPolyline, {
    width: 4,
    color: "818cf8",
    opacity: 0.9,
  });
}

export function buildRouteMarkerOverlays(waypoints: MapRouteWaypoint[]): string {
  if (waypoints.length === 0) return "";
  const start = waypoints[0]!;
  const end = waypoints[waypoints.length - 1]!;
  const markers = [
    `pin-s-a+2e7d32(${start.lng.toFixed(5)},${start.lat.toFixed(5)})`,
    `pin-s-b+e63946(${end.lng.toFixed(5)},${end.lat.toFixed(5)})`,
  ];

  if (waypoints.length <= 8) {
    for (let i = 1; i < waypoints.length - 1; i++) {
      const p = waypoints[i]!;
      markers.push(`pin-s+0a84ff(${p.lng.toFixed(5)},${p.lat.toFixed(5)})`);
    }
  }

  return markers.join(",");
}

export function buildSegmentedPathOverlays(
  roadPolylines: string[],
  flightPolylines: string[]
): string {
  return [
    ...roadPolylines.map(buildRoutePathOverlay),
    ...flightPolylines.map(buildFlightPathOverlay),
  ].join(",");
}

export function buildMapboxStaticOverlays(
  waypoints: MapRouteWaypoint[],
  encodedPolyline: string
): string {
  const path = buildRoutePathOverlay(encodedPolyline);
  const markers = buildRouteMarkerOverlays(waypoints);
  return markers ? `${markers},${path}` : path;
}

export function buildMapboxStaticOverlaysSegmented(
  markerWaypoints: MapRouteWaypoint[],
  roadPolylines: string[],
  flightPolylines: string[]
): string {
  const paths = buildSegmentedPathOverlays(roadPolylines, flightPolylines);
  const markers = buildRouteMarkerOverlays(markerWaypoints);
  return markers ? `${markers},${paths}` : paths;
}

export function buildMapboxStaticUrl(
  stylePath: string,
  overlays: string,
  width: number,
  height: number
): string | null {
  const token = MAPBOX_TOKEN;
  if (!token) return null;

  const base =
    `https://api.mapbox.com/styles/v1/${stylePath}/static/` +
    `${overlays}/auto/${width}x${height}@2x` +
    `?access_token=${encodeURIComponent(token)}&logo=false&attribution=false`;

  if (base.length > STATIC_URL_MAX_LEN) return null;
  return base;
}

/** Ground runs via Directions; transport legs as straight encoded polylines. */
export async function resolveSegmentedRoute(
  nodes: MapRouteNode[]
): Promise<SegmentedRouteResult | null> {
  if (nodes.length < 2) return null;

  const groundRuns = splitGroundRuns(nodes);
  const flightLegs = buildFlightLegs(nodes);

  const roadPolylines: string[] = [];
  let usedDirections = false;

  for (const run of groundRuns) {
    const directions = await fetchMapboxDirectionsPolyline(run);
    if (directions) {
      roadPolylines.push(directions);
      usedDirections = true;
      continue;
    }
    roadPolylines.push(encodePolyline(run));
  }

  const flightPolylines = flightLegs.map((leg) => encodePolyline(leg));

  if (roadPolylines.length === 0 && flightPolylines.length === 0) return null;

  const mode: MapRouteBuildMode =
    usedDirections && flightPolylines.length > 0
      ? "segmented"
      : usedDirections
        ? "directions"
        : "direct";

  return { roadPolylines, flightPolylines, mode };
}

/** @deprecated Use resolveSegmentedRoute — single polyline for all waypoints. */
export async function resolveRoutePolyline(
  waypoints: MapRouteWaypoint[]
): Promise<{ polyline: string; mode: "directions" | "direct" } | null> {
  if (waypoints.length < 2) return null;

  const directions = await fetchMapboxDirectionsPolyline(waypoints);
  if (directions) {
    return { polyline: directions, mode: "directions" };
  }

  return { polyline: encodePolyline(waypoints), mode: "direct" };
}
