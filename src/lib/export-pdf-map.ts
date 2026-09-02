import { writeFile } from "fs/promises";
import path from "path";
import { MAPBOX_STYLE_LIGHT, MAPBOX_TOKEN } from "@/lib/mapbox";
import {
  buildMapboxStaticOverlays,
  buildMapboxStaticUrl,
  resolveRoutePolyline,
  simplifyWaypoints,
  type MapRouteWaypoint,
} from "@/lib/mapbox-route";
import { coalesceMapPoints, type ReelMapPoint } from "@/lib/export-reel-map";
import { buildTravelRoutePoints } from "@/lib/places";
import type { PdfPhotoAsset } from "@/lib/export-pdf-types";

const MAP_CSS_W = 1280;
const MAP_CSS_H = 720;

export interface PdfMapPlaceInput {
  id: string;
  latitude: number;
  longitude: number;
  visitedAt: Date | null;
  name?: string;
}

export interface PdfMapBuildResult {
  relativePath: string;
  pointCount: number;
  routeMode: "directions" | "direct";
}

function mapboxStylePath(styleUrl: string): string {
  return styleUrl.replace(/^mapbox:\/\/styles\//, "");
}

function reelPointsToWaypoints(points: ReelMapPoint[]): MapRouteWaypoint[] {
  return points.map((p) => ({ lng: p.lng, lat: p.lat }));
}

export function pdfMapPointsFromPhotosAndPlaces(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[] = []
): ReelMapPoint[] {
  const route = buildTravelRoutePoints(
    photos.map((p) => ({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      exifDateTime: p.exifDateTime?.toISOString() ?? null,
    })),
    places.map((p) => ({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      visitedAt: p.visitedAt?.toISOString() ?? null,
    }))
  );

  return route.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    kind: p.kind,
    label:
      p.kind === "place"
        ? places.find((pl) => pl.id === p.id)?.name ?? null
        : photos.find((ph) => ph.id === p.id)?.placeName ?? null,
    at:
      p.kind === "photo"
        ? photos.find((ph) => ph.id === p.id)?.exifDateTime?.toISOString() ?? null
        : places.find((pl) => pl.id === p.id)?.visitedAt?.toISOString() ?? null,
  }));
}

/** Landscape Mapbox static image with encoded route + start/end markers. */
export function buildPdfMapStaticUrl(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[] = [],
  routePolyline?: string
): string | null {
  if (!MAPBOX_TOKEN) return null;

  const raw = pdfMapPointsFromPhotosAndPlaces(photos, places);
  const coalesced = coalesceMapPoints(raw);
  if (coalesced.length < 2) return null;

  const waypoints = reelPointsToWaypoints(coalesced);
  const markerWaypoints = simplifyWaypoints(waypoints, 8);
  const polyline = routePolyline ?? null;
  if (!polyline) return null;

  const overlays = buildMapboxStaticOverlays(markerWaypoints, polyline);
  return buildMapboxStaticUrl(
    mapboxStylePath(MAPBOX_STYLE_LIGHT),
    overlays,
    MAP_CSS_W,
    MAP_CSS_H
  );
}

/** Download map basemap + route into workDir; returns relative path or null. */
export async function fetchPdfMapImage(
  photos: PdfPhotoAsset[],
  workDir: string,
  places: PdfMapPlaceInput[] = []
): Promise<PdfMapBuildResult | null> {
  const raw = pdfMapPointsFromPhotosAndPlaces(photos, places);
  const coalesced = coalesceMapPoints(raw);
  if (coalesced.length < 2) return null;

  const waypoints = reelPointsToWaypoints(coalesced);
  const route = await resolveRoutePolyline(waypoints);
  if (!route) return null;

  const url = buildPdfMapStaticUrl(photos, places, route.polyline);
  if (!url) {
    const { encodePolyline } = await import("@/lib/mapbox-route");
    const compactPolyline = encodePolyline(simplifyWaypoints(waypoints, 12));
    const compactUrl = buildPdfMapStaticUrl(photos, places, compactPolyline);
    if (!compactUrl) return null;
    return downloadMapImage(compactUrl, workDir, coalesced.length, "direct");
  }

  return downloadMapImage(url, workDir, coalesced.length, route.mode);
}

async function downloadMapImage(
  url: string,
  workDir: string,
  pointCount: number,
  routeMode: "directions" | "direct"
): Promise<PdfMapBuildResult | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`PDF map static image failed: HTTP ${res.status}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mapDir = path.join(workDir, "map");
    const { mkdir } = await import("fs/promises");
    await mkdir(mapDir, { recursive: true });
    const relative = "map/route.png";
    await writeFile(path.join(workDir, relative), buffer);
    return { relativePath: relative, pointCount, routeMode };
  } catch (error) {
    console.warn("PDF map download failed", error);
    return null;
  }
}

/** @internal test helper */
export function buildPdfMapStaticUrlFromPhotos(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[] = [],
  routePolyline?: string
): string | null {
  return buildPdfMapStaticUrl(photos, places, routePolyline);
}
