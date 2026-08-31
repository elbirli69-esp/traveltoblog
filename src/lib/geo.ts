/** Earth distance helpers for photo ↔ place proximity. */

const EARTH_RADIUS_M = 6_371_000;

/** Haversine distance in meters. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Default association radius (~120 m). */
export const NEARBY_THRESHOLD_M = 120;

export interface GeoPoint {
  id: string;
  latitude: number;
  longitude: number;
}

export function findNearby<T extends GeoPoint>(
  origin: { latitude: number; longitude: number },
  candidates: T[],
  thresholdM: number = NEARBY_THRESHOLD_M
): Array<T & { distanceM: number }> {
  return candidates
    .map((c) => ({
      ...c,
      distanceM: distanceMeters(
        origin.latitude,
        origin.longitude,
        c.latitude,
        c.longitude
      ),
    }))
    .filter((c) => c.distanceM <= thresholdM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export function formatDistanceM(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
