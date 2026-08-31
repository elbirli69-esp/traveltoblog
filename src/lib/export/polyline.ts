/** Douglas-Peucker polyline simplification for export map routes */

export interface LatLng {
  lat: number;
  lng: number;
}

function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.lng - a.lng, p.lat - a.lat);
  }
  const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
  const projLng = a.lng + t * dx;
  const projLat = a.lat + t * dy;
  return Math.hypot(p.lng - projLng, p.lat - projLat);
}

export function simplifyPolyline(points: LatLng[], tolerance = 0.00015): LatLng[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
    const right = simplifyPolyline(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[end]];
}

export function simplifyIfNeeded(points: LatLng[], maxPoints = 100): LatLng[] {
  if (points.length <= maxPoints) return points;
  let tolerance = 0.00005;
  let simplified = points;
  while (simplified.length > maxPoints && tolerance < 0.01) {
    simplified = simplifyPolyline(points, tolerance);
    tolerance *= 2;
  }
  return simplified;
}
