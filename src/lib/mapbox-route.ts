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

export interface RoutePhotoInput {
  latitude: number | null;
  longitude: number | null;
  exifDateTime?: Date | string | null;
  isTransportStart?: boolean;
  isTransportEnd?: boolean;
}

export interface RoutePlaceInput {
  latitude: number;
  longitude: number;
  visitedAt?: Date | string | null;
}

export type MapRouteBuildMode = "segmented" | "directions" | "direct";

/** Shared palette for chronological day coloring (app, HTML, PDF). */
export const DAY_ROUTE_COLORS = [
  "#2dd4bf",
  "#f59e0b",
  "#818cf8",
  "#f472b6",
  "#34d399",
  "#fb7185",
  "#38bdf8",
  "#a78bfa",
  "#fb923c",
  "#4ade80",
] as const;

export const FLIGHT_ROUTE_COLOR = "#818cf8";

export interface RouteDayLegendEntry {
  dayKey: string | null;
  dayIndex: number;
  color: string;
  label: string;
}

export interface ColoredRouteRun {
  waypoints: MapRouteWaypoint[];
  dayKey: string | null;
  dayIndex: number;
  color: string;
  label: string;
}

export interface ColoredRoutePolyline extends Omit<ColoredRouteRun, "waypoints"> {
  polyline: string;
}

export interface ColoredRouteSegment extends Omit<ColoredRouteRun, "waypoints"> {
  coordinates: MapRouteWaypoint[];
}

export interface SegmentedRouteResult {
  /** Encoded polylines for road overlays (Mapbox Directions), day-colored. */
  roadPolylines: string[];
  coloredRoads: ColoredRoutePolyline[];
  /** Encoded polylines for flight/transport legs (straight). */
  flightPolylines: string[];
  dayLegend: RouteDayLegendEntry[];
  mode: MapRouteBuildMode;
}

export interface SegmentedRouteGeometry {
  /** Road-following segments (lat/lng) with day color metadata. */
  roadSegments: ColoredRouteSegment[];
  /** Straight flight/transport legs (lat/lng pairs). */
  flightLegs: MapRouteWaypoint[][];
  dayLegend: RouteDayLegendEntry[];
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

/** Decode Google-encoded polyline (precision 5) to coordinates. */
export function decodePolyline(
  encoded: string,
  precision = 5
): MapRouteWaypoint[] {
  const coordinates: MapRouteWaypoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({ lat: lat / factor, lng: lng / factor });
  }

  return coordinates;
}

export function routeNodeSortKey(at: string | null): string {
  return at ?? "9999-12-31T23:59:59.999Z";
}

function toRouteNodeAt(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Chronological route nodes: photos (incl. ida/vuelta) + places. */
export function buildRouteNodesFromPhotosAndPlaces(
  photos: RoutePhotoInput[],
  places: RoutePlaceInput[] = []
): MapRouteNode[] {
  const nodes: MapRouteNode[] = [];

  for (const photo of photos) {
    if (photo.latitude == null || photo.longitude == null) continue;
    let kind: MapRouteNodeKind = "ground";
    if (photo.isTransportStart) kind = "transport-out";
    else if (photo.isTransportEnd) kind = "transport-in";

    nodes.push({
      lng: photo.longitude,
      lat: photo.latitude,
      kind,
      at: toRouteNodeAt(photo.exifDateTime),
    });
  }

  for (const place of places) {
    nodes.push({
      lng: place.longitude,
      lat: place.latitude,
      kind: "ground",
      at: toRouteNodeAt(place.visitedAt),
    });
  }

  return nodes.sort((a, b) => routeNodeSortKey(a.at).localeCompare(routeNodeSortKey(b.at)));
}

/** Merge duplicate coordinates; transport markers win over ground. */
export function coalesceRouteNodes(nodes: MapRouteNode[]): MapRouteNode[] {
  const seen = new Map<string, MapRouteNode>();
  for (const node of nodes) {
    const key = `${node.lat.toFixed(4)},${node.lng.toFixed(4)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, node);
      continue;
    }
    const kind =
      node.kind !== "ground"
        ? node.kind
        : existing.kind !== "ground"
          ? existing.kind
          : "ground";
    const at =
      existing.at && node.at
        ? existing.at <= node.at
          ? existing.at
          : node.at
        : existing.at ?? node.at;
    seen.set(key, { ...existing, kind, at });
  }
  return [...seen.values()].sort((a, b) =>
    routeNodeSortKey(a.at).localeCompare(routeNodeSortKey(b.at))
  );
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

export function routeDayColor(dayIndex: number): string {
  return DAY_ROUTE_COLORS[((dayIndex % DAY_ROUTE_COLORS.length) + DAY_ROUTE_COLORS.length) % DAY_ROUTE_COLORS.length]!;
}

/** Hex without # for Mapbox Static path overlays. */
export function routeColorHex(color: string): string {
  return color.replace(/^#/, "");
}

export function dayKeyFromAt(at: string | null | undefined): string | null {
  if (!at) return null;
  const key = at.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function formatRouteDayLabel(dayKey: string | null, dayIndex: number): string {
  if (!dayKey) return dayIndex >= 0 ? `Sin fecha` : "Sin fecha";
  try {
    const date = new Date(`${dayKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return `Día ${dayIndex + 1}`;
    const formatted = new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
    }).format(date);
    return `Día ${dayIndex + 1} · ${formatted}`;
  } catch {
    return `Día ${dayIndex + 1}`;
  }
}

function buildDayIndexMap(nodes: MapRouteNode[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const node of nodes) {
    const key = dayKeyFromAt(node.at);
    if (!key || map.has(key)) continue;
    map.set(key, map.size);
  }
  return map;
}

export function buildDayLegend(nodes: MapRouteNode[]): RouteDayLegendEntry[] {
  const dayIndexMap = buildDayIndexMap(nodes);
  const entries: RouteDayLegendEntry[] = [...dayIndexMap.entries()].map(
    ([dayKey, dayIndex]) => ({
      dayKey,
      dayIndex,
      color: routeDayColor(dayIndex),
      label: formatRouteDayLabel(dayKey, dayIndex),
    })
  );
  if (nodes.some((n) => !dayKeyFromAt(n.at) && !isTransportKind(n.kind))) {
    const dayIndex = dayIndexMap.size;
    entries.push({
      dayKey: null,
      dayIndex,
      color: routeDayColor(dayIndex),
      label: "Sin fecha",
    });
  }
  return entries;
}

function isTransportKind(kind: MapRouteNodeKind): boolean {
  return kind === "transport-out" || kind === "transport-in";
}

/** Split timeline into consecutive ground runs (between transport markers). */
export function splitGroundRuns(nodes: MapRouteNode[]): MapRouteWaypoint[][] {
  return splitGroundRunsByDay(nodes).map((run) => run.waypoints);
}

/**
 * Split ground timeline by calendar day (and transport markers).
 * Prepends the previous ground point when the day changes so the line stays continuous.
 */
export function splitGroundRunsByDay(nodes: MapRouteNode[]): ColoredRouteRun[] {
  const dayIndexMap = buildDayIndexMap(nodes);
  const undatedIndex = dayIndexMap.size;
  const runs: ColoredRouteRun[] = [];
  let current: MapRouteWaypoint[] = [];
  let currentDayKey: string | null | undefined = undefined;
  let lastGround: MapRouteWaypoint | null = null;

  const metaFor = (dayKey: string | null) => {
    const dayIndex = dayKey == null ? undatedIndex : (dayIndexMap.get(dayKey) ?? 0);
    return {
      dayKey,
      dayIndex,
      color: routeDayColor(dayIndex),
      label: formatRouteDayLabel(dayKey, dayIndex < 0 ? 0 : dayIndex),
    };
  };

  const flush = () => {
    if (current.length >= 2 && currentDayKey !== undefined) {
      runs.push({
        waypoints: current,
        ...metaFor(currentDayKey),
      });
    }
    current = [];
  };

  for (const node of nodes) {
    if (isTransportKind(node.kind)) {
      flush();
      currentDayKey = undefined;
      lastGround = null;
      continue;
    }

    const dayKey = dayKeyFromAt(node.at);
    const point = { lng: node.lng, lat: node.lat };

    if (currentDayKey !== undefined && dayKey !== currentDayKey) {
      flush();
      if (lastGround) current = [lastGround];
    }

    currentDayKey = dayKey;
    current.push(point);
    lastGround = point;
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

/** Fetch road-following route geometry from Mapbox Directions API (server-side). */
export async function fetchMapboxDirectionsPolylineDirect(
  waypoints: MapRouteWaypoint[],
  profile: "driving" | "walking" = "driving"
): Promise<string | null> {
  const token = MAPBOX_TOKEN;
  if (!token || waypoints.length < 2) return null;

  const simplified = simplifyWaypoints(waypoints);
  if (simplified.length < 2) return null;

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

/**
 * Fetch Directions polyline.
 * In the browser uses `/api/mapbox/directions` (same-origin proxy).
 * On the server calls Mapbox directly.
 */
export async function fetchMapboxDirectionsPolyline(
  waypoints: MapRouteWaypoint[],
  profile: "driving" | "walking" = "driving"
): Promise<string | null> {
  if (waypoints.length < 2) return null;
  const simplified = simplifyWaypoints(waypoints);
  if (simplified.length < 2) return null;

  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/mapbox/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints: simplified, profile }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { polyline?: string | null };
      return data.polyline && data.polyline.length > 0 ? data.polyline : null;
    } catch {
      return null;
    }
  }

  return fetchMapboxDirectionsPolylineDirect(simplified, profile);
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

export function buildRoutePathOverlay(encodedPolyline: string, color = "0a84ff"): string {
  return buildPathOverlay(encodedPolyline, { color: routeColorHex(color) });
}

export function buildFlightPathOverlay(encodedPolyline: string): string {
  return buildPathOverlay(encodedPolyline, {
    width: 4,
    color: routeColorHex(FLIGHT_ROUTE_COLOR),
    opacity: 0.9,
  });
}

export function buildGpsTrailPathOverlay(encodedPolyline: string): string {
  return buildPathOverlay(encodedPolyline, {
    width: 3,
    color: "64748b",
    opacity: 0.85,
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

  const maxNumbered = Math.min(waypoints.length - 1, 9);
  for (let i = 1; i < maxNumbered; i++) {
    const p = waypoints[i]!;
    const color = routeColorHex(routeDayColor(i - 1));
    markers.push(`pin-s-${i}+${color}(${p.lng.toFixed(5)},${p.lat.toFixed(5)})`);
  }

  return markers.join(",");
}

export function buildSegmentedPathOverlays(
  roadPolylines: string[],
  flightPolylines: string[],
  roadColors?: string[],
  trailPolylines: string[] = []
): string {
  return [
    ...roadPolylines.map((polyline, i) =>
      buildRoutePathOverlay(polyline, roadColors?.[i] ?? DAY_ROUTE_COLORS[0])
    ),
    ...flightPolylines.map(buildFlightPathOverlay),
    ...trailPolylines.map(buildGpsTrailPathOverlay),
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
  flightPolylines: string[],
  roadColors?: string[],
  trailPolylines: string[] = []
): string {
  const paths = buildSegmentedPathOverlays(
    roadPolylines,
    flightPolylines,
    roadColors,
    trailPolylines
  );
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

/** Straight-line geometry (no Directions). Works with or without ida/vuelta. */
export function buildDirectRouteGeometry(
  nodes: MapRouteNode[]
): SegmentedRouteGeometry | null {
  if (nodes.length < 2) return null;

  const dayRuns = splitGroundRunsByDay(nodes);
  const flightLegs = buildFlightLegs(nodes);
  if (dayRuns.length === 0 && flightLegs.length === 0) return null;

  return {
    roadSegments: dayRuns.map((run) => ({
      coordinates: run.waypoints,
      dayKey: run.dayKey,
      dayIndex: run.dayIndex,
      color: run.color,
      label: run.label,
    })),
    flightLegs,
    dayLegend: buildDayLegend(nodes),
    mode: "direct",
  };
}

/** Which layers a map canvas should show. */
export type MapRouteScope = "all" | "flights" | "local";

export function hasFlightOverview(
  geometry: SegmentedRouteGeometry | null | undefined
): boolean {
  return (geometry?.flightLegs ?? []).some((leg) => leg.length > 1);
}

export function hasLocalActivity(
  geometry: SegmentedRouteGeometry | null | undefined
): boolean {
  return (geometry?.roadSegments ?? []).some((seg) => seg.coordinates.length > 1);
}

/** True when long-haul flights would squash local day routes on one map. */
export function shouldShowDualMaps(
  geometry: SegmentedRouteGeometry | null | undefined
): boolean {
  return hasFlightOverview(geometry) && hasLocalActivity(geometry);
}

export function partitionSegmentedRouteGeometry(
  geometry: SegmentedRouteGeometry
): {
  flights: SegmentedRouteGeometry;
  local: SegmentedRouteGeometry;
} {
  return {
    flights: {
      roadSegments: [],
      flightLegs: geometry.flightLegs,
      dayLegend: [],
      mode: geometry.mode,
    },
    local: {
      roadSegments: geometry.roadSegments,
      flightLegs: [],
      dayLegend: geometry.dayLegend,
      mode: geometry.mode,
    },
  };
}

export function filterGeometryByScope(
  geometry: SegmentedRouteGeometry | null,
  scope: MapRouteScope
): SegmentedRouteGeometry | null {
  if (!geometry) return null;
  if (scope === "all") return geometry;
  const parts = partitionSegmentedRouteGeometry(geometry);
  return scope === "flights" ? parts.flights : parts.local;
}

/** Ground runs via Directions; transport legs as straight encoded polylines. */
export async function resolveSegmentedRoute(
  nodes: MapRouteNode[]
): Promise<SegmentedRouteResult | null> {
  if (nodes.length < 2) return null;

  const dayRuns = splitGroundRunsByDay(nodes);
  const flightLegs = buildFlightLegs(nodes);

  const coloredRoads: ColoredRoutePolyline[] = [];
  let usedDirections = false;

  for (const run of dayRuns) {
    const directions = await fetchMapboxDirectionsPolyline(run.waypoints);
    const polyline = directions ?? encodePolyline(run.waypoints);
    if (directions) usedDirections = true;
    coloredRoads.push({
      polyline,
      dayKey: run.dayKey,
      dayIndex: run.dayIndex,
      color: run.color,
      label: run.label,
    });
  }

  const flightPolylines = flightLegs.map((leg) => encodePolyline(leg));

  if (coloredRoads.length === 0 && flightPolylines.length === 0) return null;

  const mode: MapRouteBuildMode =
    usedDirections && flightPolylines.length > 0
      ? "segmented"
      : usedDirections
        ? "directions"
        : "direct";

  return {
    roadPolylines: coloredRoads.map((r) => r.polyline),
    coloredRoads,
    flightPolylines,
    dayLegend: buildDayLegend(nodes),
    mode,
  };
}

/** Lat/lng segments for Leaflet or Mapbox GL (decoded from Directions polylines). */
export async function resolveSegmentedRouteGeometry(
  nodes: MapRouteNode[]
): Promise<SegmentedRouteGeometry | null> {
  const segmented = await resolveSegmentedRoute(nodes);
  if (!segmented) return null;

  return {
    roadSegments: segmented.coloredRoads.map((road) => ({
      coordinates: decodePolyline(road.polyline),
      dayKey: road.dayKey,
      dayIndex: road.dayIndex,
      color: road.color,
      label: road.label,
    })),
    flightLegs: segmented.flightPolylines.map((polyline) => decodePolyline(polyline)),
    dayLegend: segmented.dayLegend,
    mode: segmented.mode,
  };
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
