import { MAPBOX_STYLE_LIGHT, MAPBOX_TOKEN } from "@/lib/mapbox";
import { sanitizeGpsPair } from "@/lib/exif";
import type { GpsTrailPolyline } from "@/lib/gps-track-map";

export type ReelMapPointKind = "photo" | "place" | "flight";

export interface ReelMapPoint {
  lat: number;
  lng: number;
  kind: ReelMapPointKind;
  label: string | null;
  /** Sort key for route animation (ISO or sortable string) */
  at: string | null;
}

/** Straight flight/transport segment in [lat, lng] order (same as Lugares trayecto). */
export interface ReelMapFlightLeg {
  coords: Array<[number, number]>;
}

export type ReelMapOverview = "route" | "flights";

export interface ReelMapPlan {
  points: ReelMapPoint[];
  /** Portrait basemap for 9:16 cover crop (Mapbox Static, no pins) */
  staticUrl: string | null;
  center: { lat: number; lng: number };
  zoom: number;
  /** CSS pixel size of the static image (before @2x) */
  imageWidth: number;
  imageHeight: number;
  /** Animated GPS trails drawn client-side over the basemap */
  gpsTrails: GpsTrailPolyline[];
  /** "flights" matches Lugares trayecto (ida/vuelta); "route" is destination trail */
  overview: ReelMapOverview;
  /** Dashed arcs for transport legs (empty on local route overview) */
  flightLegs: ReelMapFlightLeg[];
}

function mapboxStylePath(styleUrl: string): string {
  return styleUrl.replace(/^mapbox:\/\/styles\//, "");
}

/** Deduplicate near-identical coordinates (photo + place on same spot). */
export function coalesceMapPoints(points: ReelMapPoint[], precision = 4): ReelMapPoint[] {
  const seen = new Map<string, ReelMapPoint>();
  for (const p of points) {
    const gps = sanitizeGpsPair(p.lat, p.lng);
    if (gps.latitude == null || gps.longitude == null) continue;
    const key = `${gps.latitude.toFixed(precision)},${gps.longitude.toFixed(precision)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, {
        ...p,
        lat: gps.latitude,
        lng: gps.longitude,
      });
      continue;
    }
    const label = existing.label || p.label;
    const kind =
      existing.kind === "flight" || p.kind === "flight"
        ? "flight"
        : existing.kind === "place" || p.kind === "place"
          ? "place"
          : "photo";
    const at =
      existing.at && p.at
        ? existing.at <= p.at
          ? existing.at
          : p.at
        : existing.at ?? p.at;
    seen.set(key, { ...existing, label, kind, at });
  }
  return [...seen.values()].sort((a, b) => {
    if (a.at && b.at) return a.at.localeCompare(b.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return 0;
  });
}

/** Street-level zoom so a single marked place fills the reel map frame. */
export const REEL_PLACE_FOCUS_ZOOM = 16;

export function computeMapView(points: ReelMapPoint[]): {
  center: { lat: number; lng: number };
  zoom: number;
} {
  if (points.length === 0) {
    return { center: { lat: 40.4, lng: -3.7 }, zoom: 5 };
  }
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  // Pad the span so pins aren't glued to the 9:16 edge, then pick a tighter zoom
  // so marked places read clearly on phone screens.
  const rawSpan = Math.max(maxLat - minLat, maxLng - minLng, 0.0008);
  const span = rawSpan * 1.35;
  let zoom = 15;
  if (span > 20) zoom = 3;
  else if (span > 8) zoom = 5;
  else if (span > 3) zoom = 7;
  else if (span > 1) zoom = 9;
  else if (span > 0.35) zoom = 11;
  else if (span > 0.12) zoom = 12;
  else if (span > 0.04) zoom = 13;
  else if (span > 0.015) zoom = 14;
  else if (span > 0.006) zoom = 15;
  else zoom = 16;
  if (points.length === 1) zoom = Math.max(zoom, REEL_PLACE_FOCUS_ZOOM);
  return { center, zoom };
}

export function buildReelPlaceBasemapPath(lat: number, lng: number, zoom = REEL_PLACE_FOCUS_ZOOM): string {
  return `/api/export-reel/basemap?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&zoom=${encodeURIComponent(String(zoom))}`;
}

const STATIC_CSS_W = 720;
const STATIC_CSS_H = 1280;

/** Mapbox Static Images API basemap (no pins — animated client-side). */
export function buildReelMapStaticUrl(
  center: { lat: number; lng: number },
  zoom: number
): string | null {
  const token = MAPBOX_TOKEN;
  if (!token) return null;
  const stylePath = mapboxStylePath(MAPBOX_STYLE_LIGHT);
  return `https://api.mapbox.com/styles/v1/${stylePath}/static/${center.lng},${center.lat},${zoom},0/${STATIC_CSS_W}x${STATIC_CSS_H}@2x?access_token=${encodeURIComponent(token)}&logo=false&attribution=false`;
}


/** Densify a straight leg into a gentle great-circle arc (more flight-like on map). */
/** Densify a leg into a curved arc so the trayecto reads as a flight path. */
export function densifyFlightLeg(
  coords: Array<[number, number]>,
  segments = 28
): Array<[number, number]> {
  if (coords.length < 2) return coords;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lng1] = coords[i]!;
    const [lat2, lng2] = coords[i + 1]!;
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    // Bulge the midpoint perpendicular to the chord (gentle flight arc).
    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    const len = Math.hypot(dx, dy) || 1;
    const bulge = Math.min(8, len * 0.18);
    const ctrlLat = midLat + (dx / len) * bulge;
    const ctrlLng = midLng - (dy / len) * bulge;
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const u = 1 - t;
      const lat = u * u * lat1 + 2 * u * t * ctrlLat + t * t * lat2;
      const lng = u * u * lng1 + 2 * u * t * ctrlLng + t * t * lng2;
      out.push([lat, lng]);
    }
  }
  out.push(coords[coords.length - 1]!);
  return out;
}

export function buildReelMapPlan(
  rawPoints: ReelMapPoint[],
  gpsTrails: GpsTrailPolyline[] = [],
  options?: {
    overview?: ReelMapOverview;
    flightLegs?: Array<Array<{ lat: number; lng: number }>>;
  }
): ReelMapPlan | null {
  const overview = options?.overview ?? "route";
  const flightLegs: ReelMapFlightLeg[] = (options?.flightLegs ?? [])
    .map((leg) => ({
      coords: leg
        .map((p) => {
          const gps = sanitizeGpsPair(p.lat, p.lng);
          if (gps.latitude == null || gps.longitude == null) return null;
          return [gps.latitude, gps.longitude] as [number, number];
        })
        .filter((c): c is [number, number] => c != null),
    }))
    .filter((leg) => leg.coords.length >= 2);

  // Flight overview (same idea as Lugares → Trayecto): fit only ida/vuelta legs,
  // never destination GPS trails that can pull the frame to a layover country.
  if (overview === "flights" && flightLegs.length > 0) {
    const denseLegs: ReelMapFlightLeg[] = flightLegs.map((leg) => ({
      coords: densifyFlightLeg(leg.coords, 28),
    }));
    // Fit the frame to the flight path itself (Spain↔Poland), not only airport
    // pins — ida+vuelta often share the same origin GPS and would collapse the view.
    const fromLegs: ReelMapPoint[] = denseLegs.flatMap((leg) =>
      leg.coords.map(([lat, lng]) => ({
        lat,
        lng,
        kind: "flight" as const,
        label: null,
        at: null,
      }))
    );
    if (fromLegs.length < 2) return null;
    const airportPins = coalesceMapPoints(rawPoints);
    const view = computeMapView(fromLegs);
    const zoom = Math.max(2, view.zoom - 1);
    return {
      points: airportPins.length >= 1 ? airportPins : coalesceMapPoints(fromLegs.slice(0, 1).concat(fromLegs.slice(-1))),
      staticUrl: buildReelMapStaticUrl(view.center, zoom),
      center: view.center,
      zoom,
      imageWidth: STATIC_CSS_W,
      imageHeight: STATIC_CSS_H,
      gpsTrails: [],
      overview: "flights",
      flightLegs: denseLegs,
    };
  }

  const points = coalesceMapPoints(rawPoints);
  if (points.length < 2 && gpsTrails.every((t) => t.coords.length < 2)) {
    return null;
  }
  if (points.length < 2 && gpsTrails.length === 0) return null;
  // If we only have trails, synthesize view from trail coords.
  const viewPoints =
    points.length >= 2
      ? points
      : gpsTrails.flatMap((t) =>
          t.coords.map(([lat, lng]) => ({
            lat,
            lng,
            kind: "photo" as const,
            label: null,
            at: null,
          }))
        );
  if (viewPoints.length < 2) return null;
  const view = computeMapView(viewPoints);
  return {
    points: points.length >= 2 ? points : coalesceMapPoints(viewPoints),
    staticUrl: buildReelMapStaticUrl(view.center, view.zoom),
    center: view.center,
    zoom: view.zoom,
    imageWidth: STATIC_CSS_W,
    imageHeight: STATIC_CSS_H,
    gpsTrails,
    overview: "route",
    flightLegs: [],
  };
}


/**
 * Project lon/lat onto a canvas that cover-fits a Mapbox static image
 * of `imageWidth`×`imageHeight` CSS pixels at the given center/zoom.
 */
export function projectMapPoint(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  zoom: number,
  canvasW: number,
  canvasH: number,
  imageWidth = STATIC_CSS_W,
  imageHeight = STATIC_CSS_H
): { x: number; y: number } {
  const worldSize = 256 * Math.pow(2, zoom);
  const toPx = (la: number, ln: number) => {
    const x = ((ln + 180) / 360) * worldSize;
    const sin = Math.sin((la * Math.PI) / 180);
    const y =
      (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize;
    return { x, y };
  };
  const c = toPx(center.lat, center.lng);
  const p = toPx(lat, lng);
  // Static image shows `imageWidth`×`imageHeight` CSS px centered on `center`
  const cover = Math.max(canvasW / imageWidth, canvasH / imageHeight);
  const drawnW = imageWidth * cover;
  const drawnH = imageHeight * cover;
  const ox = (canvasW - drawnW) / 2;
  const oy = (canvasH - drawnH) / 2;
  const scale = drawnW / imageWidth;
  const dx = (p.x - c.x) * scale;
  const dy = (p.y - c.y) * scale;
  return {
    x: ox + drawnW / 2 + dx,
    y: oy + drawnH / 2 + dy,
  };
}
