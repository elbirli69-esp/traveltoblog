import { MAPBOX_STYLE_LIGHT, MAPBOX_TOKEN } from "@/lib/mapbox";
import { sanitizeGpsPair } from "@/lib/exif";
import type { GpsTrailPolyline } from "@/lib/gps-track-map";

export interface ReelMapPoint {
  lat: number;
  lng: number;
  kind: "photo" | "place";
  label: string | null;
  /** Sort key for route animation (ISO or sortable string) */
  at: string | null;
}

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
    const kind = existing.kind === "place" || p.kind === "place" ? "place" : "photo";
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
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.002);
  let zoom = 12;
  if (span > 20) zoom = 3;
  else if (span > 8) zoom = 5;
  else if (span > 3) zoom = 6;
  else if (span > 1) zoom = 8;
  else if (span > 0.35) zoom = 9;
  else if (span > 0.12) zoom = 10;
  else if (span > 0.04) zoom = 11;
  else if (span > 0.015) zoom = 12;
  else zoom = 13;
  if (points.length === 1) zoom = Math.min(zoom, 12);
  return { center, zoom };
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

export function buildReelMapPlan(
  rawPoints: ReelMapPoint[],
  gpsTrails: GpsTrailPolyline[] = []
): ReelMapPlan | null {
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
