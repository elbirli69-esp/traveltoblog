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
  kind: "combined" | "flights" | "local";
}

export interface PdfDualMapResult {
  /** Primary/local (or combined when dual maps are not needed). */
  local: PdfMapBuildResult | null;
  /** Flight overview when dual maps apply. */
  flights: PdfMapBuildResult | null;
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

function flightMarkerWaypoints(
  photos: PdfPhotoAsset[]
): { lng: number; lat: number }[] {
  return simplifyWaypoints(transportMarkerWaypoints(photos), 8);
}

function transportMarkerWaypoints(
  photos: PdfPhotoAsset[]
): { lng: number; lat: number }[] {
  return photos
    .filter(
      (p) =>
        (p.isTransportStart || p.isTransportEnd) &&
        p.latitude != null &&
        p.longitude != null
    )
    .map((p) => ({ lng: p.longitude!, lat: p.latitude! }));
}

function localMarkerWaypoints(
  photos: PdfPhotoAsset[],
  places: PdfMapPlaceInput[]
): { lng: number; lat: number }[] {
  const photoPts = photos
    .filter(
      (p) =>
        !p.isTransportStart &&
        !p.isTransportEnd &&
        p.latitude != null &&
        p.longitude != null
    )
    .map((p) => ({ lng: p.longitude!, lat: p.latitude! }));
  const placePts = places.map((p) => ({ lng: p.longitude, lat: p.latitude }));
  return simplifyWaypoints([...photoPts, ...placePts], 8);
}

async function downloadMapImage(
  url: string,
  workDir: string,
  relative: string,
  pointCount: number,
  routeMode: MapRouteBuildMode,
  dayLegend: PdfMapBuildResult["dayLegend"],
  kind: PdfMapBuildResult["kind"]
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
    await writeFile(path.join(workDir, relative), buffer);
    return { relativePath: relative, pointCount, routeMode, dayLegend, kind };
  } catch (error) {
    console.warn("PDF map download failed", error);
    return null;
  }
}

async function renderSegmentedMap(options: {
  workDir: string;
  filename: string;
  kind: PdfMapBuildResult["kind"];
  markerWaypoints: { lng: number; lat: number }[];
  roadPolylines: string[];
  flightPolylines: string[];
  roadColors: string[];
  trailPolylines: string[];
  pointCount: number;
  routeMode: MapRouteBuildMode;
  dayLegend: PdfMapBuildResult["dayLegend"];
}): Promise<PdfMapBuildResult | null> {
  let url = buildPdfMapStaticUrl(
    options.markerWaypoints,
    options.roadPolylines,
    options.flightPolylines,
    options.roadColors,
    options.trailPolylines
  );

  if (!url && options.roadPolylines.length > 1) {
    const merged = encodePolyline(options.markerWaypoints);
    url = buildPdfMapStaticUrl(
      options.markerWaypoints,
      [merged],
      options.flightPolylines,
      options.roadColors.slice(0, 1),
      options.trailPolylines
    );
  }

  if (!url) return null;

  return downloadMapImage(
    url,
    options.workDir,
    options.filename,
    options.pointCount,
    options.routeMode,
    options.dayLegend,
    options.kind
  );
}

/**
 * Build destination (local) + optional flight-overview maps so long-haul
 * flights do not crush the on-trip zoom.
 */
export async function fetchPdfDualMapImages(
  photos: PdfPhotoAsset[],
  workDir: string,
  places: PdfMapPlaceInput[] = [],
  gpsTracks: GpsTrackForMap[] = []
): Promise<PdfDualMapResult> {
  const nodes = coalesceRouteNodes(buildPdfRouteNodes(photos, places));
  const trailPolylines = encodeGpsTrailsForStaticMap(gpsTracks, encodePolyline);
  if (nodes.length < 2 && trailPolylines.length === 0) {
    return { local: null, flights: null };
  }

  const segmented =
    nodes.length >= 2 ? await resolveSegmentedRoute(nodes) : null;
  if (!segmented && trailPolylines.length === 0) {
    return { local: null, flights: null };
  }

  const allMarkers = simplifyWaypoints(
    reelPointsToWaypoints(
      coalesceMapPoints(pdfMapPointsFromPhotosAndPlaces(photos, places))
    ),
    8
  );

  // Prefer polyline counts for dual decision (more reliable than decoded geometry).
  const dual =
    Boolean(segmented) &&
    segmented!.flightPolylines.length > 0 &&
    (segmented!.roadPolylines.length > 0 || trailPolylines.length > 0);

  if (!dual) {
    const combined = await renderSegmentedMap({
      workDir,
      filename: "map/route.png",
      kind: "combined",
      markerWaypoints: allMarkers,
      roadPolylines: segmented?.roadPolylines ?? [],
      flightPolylines: segmented?.flightPolylines ?? [],
      roadColors: segmented?.coloredRoads.map((r) => r.color) ?? [],
      trailPolylines,
      pointCount: Math.max(nodes.length, trailPolylines.length),
      routeMode: segmented?.mode ?? "direct",
      dayLegend: segmented?.dayLegend ?? [],
    });
    return { local: combined, flights: null };
  }

  const flightMarkers = flightMarkerWaypoints(photos);
  const localMarkers = localMarkerWaypoints(photos, places);

  const [flights, local] = await Promise.all([
    renderSegmentedMap({
      workDir,
      filename: "map/flights.png",
      kind: "flights",
      markerWaypoints: flightMarkers.length > 0 ? flightMarkers : allMarkers,
      roadPolylines: [],
      flightPolylines: segmented!.flightPolylines,
      roadColors: [],
      trailPolylines: [],
      pointCount: flightMarkers.length || segmented!.flightPolylines.length,
      routeMode: segmented!.mode,
      dayLegend: [],
    }),
    renderSegmentedMap({
      workDir,
      filename: "map/local.png",
      kind: "local",
      markerWaypoints: localMarkers.length > 0 ? localMarkers : allMarkers,
      roadPolylines: segmented!.roadPolylines,
      flightPolylines: [],
      roadColors: segmented!.coloredRoads.map((r) => r.color),
      trailPolylines,
      pointCount: Math.max(localMarkers.length, trailPolylines.length),
      routeMode: segmented!.mode,
      dayLegend: segmented!.dayLegend,
    }),
  ]);

  // If local failed, fall back to combined so PDF still has a map.
  if (!local && !flights) {
    const combined = await renderSegmentedMap({
      workDir,
      filename: "map/route.png",
      kind: "combined",
      markerWaypoints: allMarkers,
      roadPolylines: segmented!.roadPolylines,
      flightPolylines: segmented!.flightPolylines,
      roadColors: segmented!.coloredRoads.map((r) => r.color),
      trailPolylines,
      pointCount: Math.max(nodes.length, trailPolylines.length),
      routeMode: segmented!.mode,
      dayLegend: segmented!.dayLegend,
    });
    return { local: combined, flights: null };
  }

  return {
    flights,
    local:
      local ??
      (await renderSegmentedMap({
        workDir,
        filename: "map/local.png",
        kind: "local",
        markerWaypoints: allMarkers,
        roadPolylines: segmented!.roadPolylines,
        flightPolylines: [],
        roadColors: segmented!.coloredRoads.map((r) => r.color),
        trailPolylines,
        pointCount: nodes.length,
        routeMode: segmented!.mode,
        dayLegend: segmented!.dayLegend,
      })),
  };
}

/** @deprecated Prefer fetchPdfDualMapImages — kept for callers/tests. */
export async function fetchPdfMapImage(
  photos: PdfPhotoAsset[],
  workDir: string,
  places: PdfMapPlaceInput[] = [],
  gpsTracks: GpsTrackForMap[] = []
): Promise<PdfMapBuildResult | null> {
  const dual = await fetchPdfDualMapImages(photos, workDir, places, gpsTracks);
  return dual.local ?? dual.flights;
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
