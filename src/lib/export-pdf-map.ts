import { writeFile } from "fs/promises";
import path from "path";
import { MAPBOX_STYLE_LIGHT, MAPBOX_TOKEN } from "@/lib/mapbox";
import {
  buildMapboxStaticOverlaysSegmented,
  buildMapboxStaticUrl,
  resolveSegmentedRoute,
  simplifyWaypoints,
  type MapRouteNode,
  type MapRouteBuildMode,
} from "@/lib/mapbox-route";
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
}

function mapboxStylePath(styleUrl: string): string {
  return styleUrl.replace(/^mapbox:\/\/styles\//, "");
}

function sortKey(at: string | null): string {
  return at ?? "9999-12-31T23:59:59.999Z";
}

/** Chronological route nodes: photos (incl. ida/vuelta) + places. */
export function buildPdfRouteNodes(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[] = []
): MapRouteNode[] {
  const nodes: MapRouteNode[] = [];

  for (const photo of photos) {
    if (photo.latitude == null || photo.longitude == null) continue;
    let kind: MapRouteNode["kind"] = "ground";
    if (photo.isTransportStart) kind = "transport-out";
    else if (photo.isTransportEnd) kind = "transport-in";

    nodes.push({
      lng: photo.longitude,
      lat: photo.latitude,
      kind,
      at: photo.exifDateTime?.toISOString() ?? null,
    });
  }

  for (const place of places) {
    nodes.push({
      lng: place.longitude,
      lat: place.latitude,
      kind: "ground",
      at: place.visitedAt?.toISOString() ?? null,
    });
  }

  return nodes.sort((a, b) => sortKey(a.at).localeCompare(sortKey(b.at)));
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

function coalesceRouteNodes(nodes: MapRouteNode[]): MapRouteNode[] {
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
  return [...seen.values()].sort((a, b) => sortKey(a.at).localeCompare(sortKey(b.at)));
}

/** Landscape Mapbox static image with road + flight route overlays. */
export function buildPdfMapStaticUrl(
  markerWaypoints: { lng: number; lat: number }[],
  roadPolylines: string[],
  flightPolylines: string[]
): string | null {
  if (!MAPBOX_TOKEN) return null;
  if (roadPolylines.length === 0 && flightPolylines.length === 0) return null;

  const overlays = buildMapboxStaticOverlaysSegmented(
    markerWaypoints,
    roadPolylines,
    flightPolylines
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
  places: PdfMapPlaceInput[] = []
): Promise<PdfMapBuildResult | null> {
  const nodes = coalesceRouteNodes(buildPdfRouteNodes(photos, places));
  if (nodes.length < 2) return null;

  const segmented = await resolveSegmentedRoute(nodes);
  if (!segmented) return null;

  const markerPoints = reelPointsToWaypoints(
    coalesceMapPoints(pdfMapPointsFromPhotosAndPlaces(photos, places))
  );
  const markerWaypoints = simplifyWaypoints(markerPoints, 8);

  let url = buildPdfMapStaticUrl(
    markerWaypoints,
    segmented.roadPolylines,
    segmented.flightPolylines
  );

  if (!url && segmented.roadPolylines.length > 1) {
    const { encodePolyline } = await import("@/lib/mapbox-route");
    const merged = encodePolyline(markerWaypoints);
    url = buildPdfMapStaticUrl(markerWaypoints, [merged], segmented.flightPolylines);
  }

  if (!url) return null;

  return downloadMapImage(url, workDir, nodes.length, segmented.mode);
}

async function downloadMapImage(
  url: string,
  workDir: string,
  pointCount: number,
  routeMode: MapRouteBuildMode
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
    segmented.flightPolylines
  );
}
