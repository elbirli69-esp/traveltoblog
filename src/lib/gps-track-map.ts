import { simplifyIfNeeded } from "@/lib/export/polyline";

export interface GpsTrackPoint {
  lat: number;
  lng: number;
  at?: string;
}

export interface GpsTrackForMap {
  id: string;
  points: GpsTrackPoint[];
  includeInExport?: boolean;
  alias?: string;
  startedAt?: Date | string | null;
}

export interface GpsTrailPolyline {
  id: string;
  alias: string;
  coords: [number, number][];
}

const GPS_TRAIL_COLOR = "#64748b";

/** Tracks that should appear on export maps / timeline. */
export function selectExportGpsTracks<T extends { includeInExport?: boolean }>(
  tracks: T[],
  includeGpsTrail = false
): T[] {
  if (includeGpsTrail) return tracks;
  return tracks.filter((t) => t.includeInExport);
}

function normalizePoints(points: GpsTrackPoint[]): { lat: number; lng: number }[] {
  return points.filter(
    (p) =>
      typeof p.lat === "number" &&
      typeof p.lng === "number" &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
  );
}

/** Simplify recorded tracks into Leaflet-friendly [lat, lng] polylines. */
export function buildGpsTrailPolylines(
  tracks: GpsTrackForMap[],
  maxPointsPerTrack = 120
): GpsTrailPolyline[] {
  const trails: GpsTrailPolyline[] = [];
  for (const track of tracks) {
    const raw = normalizePoints(track.points ?? []);
    if (raw.length < 2) continue;
    const simplified = simplifyIfNeeded(raw, maxPointsPerTrack);
    trails.push({
      id: track.id,
      alias: track.alias?.trim() || "GPS",
      coords: simplified.map((p) => [p.lat, p.lng] as [number, number]),
    });
  }
  return trails;
}

export function gpsTrailsHaveGeometry(trails: GpsTrailPolyline[]): boolean {
  return trails.some((t) => t.coords.length >= 2);
}

export function gpsTrailMapColor(): string {
  return GPS_TRAIL_COLOR;
}

/** Encode trails for Mapbox Static API (lng/lat order). */
export function encodeGpsTrailsForStaticMap(
  tracks: GpsTrackForMap[],
  encodePolyline: (waypoints: { lng: number; lat: number }[]) => string,
  maxPointsPerTrack = 80
): string[] {
  const encoded: string[] = [];
  for (const track of tracks) {
    const raw = normalizePoints(track.points ?? []);
    if (raw.length < 2) continue;
    const simplified = simplifyIfNeeded(raw, maxPointsPerTrack);
    encoded.push(
      encodePolyline(simplified.map((p) => ({ lng: p.lng, lat: p.lat })))
    );
  }
  return encoded.filter((p) => p.length > 0);
}
