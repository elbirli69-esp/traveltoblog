import { readFile } from "fs/promises";
import path from "path";
import { extractExifFromBuffer, mergeExifMetadata, sanitizeGpsPair } from "@/lib/exif";
import type { ExifMetadata } from "@/types";

export interface StoredPhotoExifInput {
  url: string;
  exifDateTime: Date | null;
  latitude: number | null;
  longitude: number | null;
}

export async function readStoredPhotoBuffer(photoUrl: string): Promise<Buffer | null> {
  const relative = photoUrl.startsWith("/") ? photoUrl.slice(1) : photoUrl;
  const filepath = path.join(process.cwd(), "public", relative);
  try {
    return await readFile(filepath);
  } catch {
    return null;
  }
}

/** Fill missing GPS/date from the stored image file when DB values are empty. */
export async function resolvePhotoExifFromFile(
  photo: StoredPhotoExifInput
): Promise<ExifMetadata & { changed: boolean }> {
  const dbGps = sanitizeGpsPair(photo.latitude, photo.longitude);
  const current: ExifMetadata = {
    dateTime: photo.exifDateTime,
    latitude: dbGps.latitude,
    longitude: dbGps.longitude,
  };

  const needsGps = current.latitude == null || current.longitude == null;
  const needsDate = photo.exifDateTime == null;
  if (!needsGps && !needsDate) {
    return { ...current, changed: dbGps.latitude !== photo.latitude || dbGps.longitude !== photo.longitude };
  }

  const buffer = await readStoredPhotoBuffer(photo.url);
  if (!buffer) {
    return { ...current, changed: false };
  }

  const fromFile = await extractExifFromBuffer(buffer);
  const merged = mergeExifMetadata(current, fromFile);
  const changed =
    merged.latitude !== dbGps.latitude ||
    merged.longitude !== dbGps.longitude ||
    merged.dateTime?.getTime() !== photo.exifDateTime?.getTime();

  return { ...merged, changed };
}
