import { MAPBOX_TOKEN } from "@/lib/mapbox";

export interface MapRouteWaypoint {
  lng: number;
  lat: number;
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

export function buildRoutePathOverlay(encodedPolyline: string): string {
  const enc = encodeURIComponent(encodedPolyline);
  return `path-6+0a84ff-0.95(${enc})`;
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

export function buildMapboxStaticOverlays(
  waypoints: MapRouteWaypoint[],
  encodedPolyline: string
): string {
  const path = buildRoutePathOverlay(encodedPolyline);
  const markers = buildRouteMarkerOverlays(waypoints);
  return markers ? `${markers},${path}` : path;
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

/** Resolve route polyline: Directions API first, straight-line encoded fallback. */
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
