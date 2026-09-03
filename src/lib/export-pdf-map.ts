import { writeFile } from "fs/promises";
import path from "path";
import { MAPBOX_STYLE_LIGHT, MAPBOX_TOKEN } from "@/lib/mapbox";
import {
  buildMapboxStaticOverlaysSegmented,
  buildMapboxStaticUrl,
  buildRouteNodesFromPhotosAndPlaces,
  coalesceRouteNodes,
  encodePolyline,
  resolveSegmentedRoute,
  simplifyWaypoints,
  type MapRouteBuildMode,
} from "@/lib/mapbox-route";
import { encodeGpsTrailsForStaticMap, type GpsTrackForMap } from "@/lib/gps-track-map";
import { coalesceMapPoints, type ReelMapPoint } from "@/lib/export-reel-map";
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
  routeMode: MapRouteBuildMode;
  dayLegend: { dayKey: string | null; dayIndex: number; color: string; label: string }[];
}

function mapboxStylePath(styleUrl: string): string {
  return styleUrl.replace(/^mapbox:\/\/styles\//, "");
}

/** Chronological route nodes: photos (incl. ida/vuelta) + places. */
export function buildPdfRouteNodes(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[] = []
) {
  return buildRouteNodesFromPhotosAndPlaces(
    photos.map((photo) => ({
      latitude: photo.latitude,
      longitude: photo.longitude,
      exifDateTime: photo.exifDateTime,
      isTransportStart: photo.isTransportStart,
      isTransportEnd: photo.isTransportEnd,
    })),
    places.map((place) => ({
      latitude: place.latitude,
      longitude: place.longitude,
      visitedAt: place.visitedAt,
    }))
  );
}

function reelPointsToWaypoints(points: ReelMapPoint[]): { lng: number; lat: number }[] {
  return points.map((p) => ({ lng: p.lng, lat: p.lat }));
}

export function pdfMapPointsFromPhotosAndPlaces(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[] = []
): ReelMapPoint[] {
  return buildPdfRouteNodes(photos, places).map((n) => ({
    lat: n.lat,
    lng: n.lng,
    kind: n.kind === "ground" ? ("photo" as const) : ("place" as const),
    label: null,
    at: n.at,
  }));
}

/** Landscape Mapbox static image with road + flight + optional GPS trail overlays. */
export function buildPdfMapStaticUrl(
  markerWaypoints: { lng: number; lat: number }[],
  roadPolylines: string[],
  flightPolylines: string[],
  roadColors?: string[],
  trailPolylines: string[] = []
): string | null {
  if (!MAPBOX_TOKEN) return null;
  if (
    roadPolylines.length === 0 &&
    flightPolylines.length === 0 &&
    trailPolylines.length === 0
  ) {
    return null;
  }

  const overlays = buildMapboxStaticOverlaysSegmented(
    markerWaypoints,
    roadPolylines,
    flightPolylines,
    roadColors,
    trailPolylines
  );
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
  places: PdfMapPlaceInput[] = [],
  gpsTracks: GpsTrackForMap[] = []
): Promise<PdfMapBuildResult | null> {
  const nodes = coalesceRouteNodes(buildPdfRouteNodes(photos, places));
  const trailPolylines = encodeGpsTrailsForStaticMap(gpsTracks, encodePolyline);
  if (nodes.length < 2 && trailPolylines.length === 0) return null;

  const segmented =
    nodes.length >= 2 ? await resolveSegmentedRoute(nodes) : null;
  if (!segmented && trailPolylines.length === 0) return null;

  const markerPoints = reelPointsToWaypoints(
    coalesceMapPoints(pdfMapPointsFromPhotosAndPlaces(photos, places))
  );
  const markerWaypoints = simplifyWaypoints(markerPoints, 8);
  const roadColors = segmented?.coloredRoads.map((r) => r.color) ?? [];
  const roadPolylines = segmented?.roadPolylines ?? [];
  const flightPolylines = segmented?.flightPolylines ?? [];

  let url = buildPdfMapStaticUrl(
    markerWaypoints,
    roadPolylines,
    flightPolylines,
    roadColors,
    trailPolylines
  );

  if (!url && roadPolylines.length > 1) {
    const merged = encodePolyline(markerWaypoints);
    url = buildPdfMapStaticUrl(
      markerWaypoints,
      [merged],
      flightPolylines,
      roadColors.slice(0, 1),
      trailPolylines
    );
  }

  if (!url) return null;

  return downloadMapImage(
    url,
    workDir,
    Math.max(nodes.length, trailPolylines.length),
    segmented?.mode ?? "direct",
    segmented?.dayLegend ?? []
  );
}

async function downloadMapImage(
  url: string,
  workDir: string,
  pointCount: number,
  routeMode: MapRouteBuildMode,
  dayLegend: PdfMapBuildResult["dayLegend"]
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
    return { relativePath: relative, pointCount, routeMode, dayLegend };
  } catch (error) {
    console.warn("PDF map download failed", error);
    return null;
  }
}

/** @internal test helper */
export async function buildPdfMapStaticUrlFromPhotos(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[] = []
): Promise<string | null> {
  const nodes = buildPdfRouteNodes(photos, places);
  const segmented = await resolveSegmentedRoute(nodes);
  if (!segmented) return null;
  const markerWaypoints = simplifyWaypoints(
    reelPointsToWaypoints(coalesceMapPoints(pdfMapPointsFromPhotosAndPlaces(photos, places))),
    8
  );
  return buildPdfMapStaticUrl(
    markerWaypoints,
    segmented.roadPolylines,
    segmented.flightPolylines,
    segmented.coloredRoads.map((r) => r.color)
  );
}
