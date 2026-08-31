import { readFile } from "fs/promises";
import path from "path";
import { extractExifFromBuffer, mergeExifMetadata } from "@/lib/exif";
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
  const current: ExifMetadata = {
    dateTime: photo.exifDateTime,
    latitude: photo.latitude,
    longitude: photo.longitude,
  };

  const needsGps = photo.latitude == null || photo.longitude == null;
  const needsDate = photo.exifDateTime == null;
  if (!needsGps && !needsDate) {
    return { ...current, changed: false };
  }

  const buffer = await readStoredPhotoBuffer(photo.url);
  if (!buffer) {
    return { ...current, changed: false };
  }

  const fromFile = await extractExifFromBuffer(buffer);
  const merged = mergeExifMetadata(current, fromFile);
  const changed =
    merged.latitude !== photo.latitude ||
    merged.longitude !== photo.longitude ||
    merged.dateTime?.getTime() !== photo.exifDateTime?.getTime();

  return { ...merged, changed };
}
