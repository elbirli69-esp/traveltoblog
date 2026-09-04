import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  fetchPdfDualMapImages,
  type PdfMapPlaceInput,
} from "@/lib/export-pdf-map";
import type { PdfPhotoAsset } from "@/lib/export-pdf-types";
import {
  selectExportGpsTracks,
  type GpsTrackForMap,
} from "@/lib/gps-track-map";

export interface HtmlStaticMapPhotoInput {
  id: string;
  url: string;
  localPath: string;
  latitude: number | null;
  longitude: number | null;
  exifDateTime: Date | null;
  alias: string;
  isTransportStart: boolean;
  isTransportEnd: boolean;
}

export interface HtmlStaticMapPlaceInput {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  visitedAt?: Date | string | null;
}

export interface HtmlStaticMapFiles {
  /** relativePath → PNG buffer (e.g. map/local.png). */
  files: Map<string, Buffer>;
  localPath: string | null;
  flightPath: string | null;
}

function toPdfPhotos(photos: HtmlStaticMapPhotoInput[]): PdfPhotoAsset[] {
  return photos.map((photo) => ({
    id: photo.id,
    url: photo.url,
    filename: photo.id,
    imagePath: photo.localPath,
    bleedImagePath: photo.localPath,
    latitude: photo.latitude,
    longitude: photo.longitude,
    exifDateTime: photo.exifDateTime,
    alias: photo.alias,
    notes: [],
    isTransportStart: photo.isTransportStart,
    isTransportEnd: photo.isTransportEnd,
  }));
}

function toPdfPlaces(places: HtmlStaticMapPlaceInput[]): PdfMapPlaceInput[] {
  return places.map((place) => ({
    id: place.id ?? place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    visitedAt:
      place.visitedAt == null
        ? null
        : place.visitedAt instanceof Date
          ? place.visitedAt
          : new Date(place.visitedAt),
    name: place.name,
  }));
}

/**
 * Build Mapbox static PNGs for HTML export so the diary stays readable offline
 * when interactive tiles cannot load.
 */
export async function fetchHtmlStaticMapImages(
  photos: HtmlStaticMapPhotoInput[],
  places: HtmlStaticMapPlaceInput[] = [],
  gpsTracks: GpsTrackForMap[] = [],
  includeGpsTrail = false
): Promise<HtmlStaticMapFiles> {
  const empty: HtmlStaticMapFiles = {
    files: new Map(),
    localPath: null,
    flightPath: null,
  };
  if (photos.length === 0 && places.length === 0 && gpsTracks.length === 0) {
    return empty;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "ttb-html-map-"));
  try {
    const selectedTracks = selectExportGpsTracks(gpsTracks, includeGpsTrail);
    const dual = await fetchPdfDualMapImages(
      toPdfPhotos(photos),
      workDir,
      toPdfPlaces(places),
      selectedTracks
    );

    const files = new Map<string, Buffer>();
    let localPath: string | null = null;
    let flightPath: string | null = null;

    if (dual.local?.relativePath) {
      const buf = await readFile(path.join(workDir, dual.local.relativePath));
      files.set(dual.local.relativePath, buf);
      localPath = dual.local.relativePath;
    }
    if (dual.flights?.relativePath) {
      const buf = await readFile(path.join(workDir, dual.flights.relativePath));
      files.set(dual.flights.relativePath, buf);
      flightPath = dual.flights.relativePath;
    }

    return { files, localPath, flightPath };
  } catch (error) {
    console.warn("HTML static map fetch failed", error);
    return empty;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
