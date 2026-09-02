import { writeFile } from "fs/promises";
import path from "path";
import { MAPBOX_STYLE_LIGHT, MAPBOX_TOKEN } from "@/lib/mapbox";
import {
  coalesceMapPoints,
  computeMapView,
  type ReelMapPoint,
} from "@/lib/export-reel-map";
import type { PdfPhotoAsset } from "@/lib/export-pdf-types";

const MAP_CSS_W = 1280;
const MAP_CSS_H = 720;

function mapboxStylePath(styleUrl: string): string {
  return styleUrl.replace(/^mapbox:\/\/styles\//, "");
}

function buildRouteOverlay(points: ReelMapPoint[]): string | null {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  return `path-4+0a84ff-0.85(${coords})`;
}

/** Landscape Mapbox static image with optional route polyline. */
export function buildPdfMapStaticUrl(points: ReelMapPoint[]): string | null {
  const token = MAPBOX_TOKEN;
  if (!token) return null;

  const coalesced = coalesceMapPoints(points);
  if (coalesced.length < 2) return null;

  const view = computeMapView(coalesced);
  const stylePath = mapboxStylePath(MAPBOX_STYLE_LIGHT);
  const overlay = buildRouteOverlay(coalesced);
  const overlayPart = overlay ? `${overlay}/` : "";
  const { lng, lat } = view.center;

  return `https://api.mapbox.com/styles/v1/${stylePath}/static/${overlayPart}${lng},${lat},${view.zoom},0/${MAP_CSS_W}x${MAP_CSS_H}@2x?access_token=${encodeURIComponent(token)}&logo=false&attribution=false`;
}

export function pdfMapPointsFromPhotos(photos: PdfPhotoAsset[]): ReelMapPoint[] {
  const points: ReelMapPoint[] = [];
  for (const photo of photos) {
    if (photo.latitude == null || photo.longitude == null) continue;
    points.push({
      lat: photo.latitude,
      lng: photo.longitude,
      kind: "photo",
      label: photo.placeName ?? null,
      at: photo.exifDateTime?.toISOString() ?? null,
    });
  }
  return points;
}

/** Download map basemap + route into workDir; returns relative path or null. */
export async function fetchPdfMapImage(
  photos: PdfPhotoAsset[],
  workDir: string
): Promise<string | null> {
  const points = pdfMapPointsFromPhotos(photos);
  const url = buildPdfMapStaticUrl(points);
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const mapDir = path.join(workDir, "map");
    const { mkdir } = await import("fs/promises");
    await mkdir(mapDir, { recursive: true });
    const relative = "map/route.jpg";
    await writeFile(path.join(workDir, relative), buffer);
    return relative;
  } catch {
    return null;
  }
}

/** @internal test helper */
export function buildPdfMapStaticUrlFromPhotos(photos: PdfPhotoAsset[]): string | null {
  return buildPdfMapStaticUrl(pdfMapPointsFromPhotos(photos));
}
