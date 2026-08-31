import exifr from "exifr";
import type { ExifMetadata } from "@/types";

/**
 * Extract EXIF metadata from an image file entirely on the client.
 * Uses exifr — no server upload required for metadata parsing.
 */
export async function extractExifFromFile(file: File): Promise<ExifMetadata> {
  try {
    const [dateTime, gps] = await Promise.all([
      exifr.parse(file, ["DateTimeOriginal", "CreateDate", "ModifyDate"]),
      exifr.gps(file),
    ]);

    const rawDate =
      dateTime?.DateTimeOriginal ?? dateTime?.CreateDate ?? dateTime?.ModifyDate;

    let parsedDate: Date | null = null;
    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
      parsedDate = rawDate;
    } else if (typeof rawDate === "string") {
      const d = new Date(rawDate);
      parsedDate = Number.isNaN(d.getTime()) ? null : d;
    }

    return {
      dateTime: parsedDate,
      latitude: typeof gps?.latitude === "number" ? gps.latitude : null,
      longitude: typeof gps?.longitude === "number" ? gps.longitude : null,
    };
  } catch {
    return { dateTime: null, latitude: null, longitude: null };
  }
}

export function isPhotoInTravelRange(
  exifDate: Date | null,
  range: { start: Date | null; end: Date | null }
): boolean {
  if (!exifDate) return true;
  if (range.start && exifDate < range.start) return false;
  if (range.end && exifDate > range.end) return false;
  return true;
}

export function formatExifDate(date: Date | null): string {
  if (!date) return "Sin fecha EXIF";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
