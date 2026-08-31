import exifr from "exifr";
import type { ExifMetadata } from "@/types";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?)$/i;

const EMPTY_EXIF: ExifMetadata = { dateTime: null, latitude: null, longitude: null };

/** Acepta imágenes aunque el navegador no rellene file.type (común en móvil). */
export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

type ExifSource = Blob | ArrayBuffer | Buffer;

async function toArrayBuffer(source: ExifSource): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return source;
  if (Buffer.isBuffer(source)) {
    return Uint8Array.from(source).buffer;
  }
  return source.arrayBuffer();
}

function parseExifDate(rawDate: unknown): Date | null {
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return rawDate;
  }
  if (typeof rawDate === "string") {
    const d = new Date(rawDate);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

async function readGps(source: ExifSource): Promise<{ latitude: number; longitude: number } | null> {
  const input = await toArrayBuffer(source);

  const strategies = [
    () => exifr.gps(input),
    () =>
      exifr.parse(input, {
        gps: true,
        xmp: true,
        exif: true,
        reviveValues: true,
      }),
    () =>
      exifr.parse(input, {
        pick: ["latitude", "longitude", "GPSLatitude", "GPSLongitude"],
        gps: true,
        reviveValues: true,
      }),
  ];

  for (const strategy of strategies) {
    const result = await strategy().catch(() => null);
    const coords = normalizeGpsResult(result);
    if (coords) return coords;
  }

  return null;
}

function normalizeGpsResult(
  result: unknown
): { latitude: number; longitude: number } | null {
  if (!result || typeof result !== "object") return null;

  const data = result as Record<string, unknown>;
  const lat = data.latitude ?? data.GPSLatitude;
  const lng = data.longitude ?? data.GPSLongitude;

  if (typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0)) {
    return { latitude: lat, longitude: lng };
  }

  return null;
}

async function readDateTime(source: ExifSource): Promise<Date | null> {
  const input = await toArrayBuffer(source);
  const dateTime = await exifr
    .parse(input, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
      reviveValues: true,
    })
    .catch(() => null);

  const rawDate =
    dateTime?.DateTimeOriginal ?? dateTime?.CreateDate ?? dateTime?.ModifyDate;
  return parseExifDate(rawDate);
}

/** Extract EXIF from a Blob/File (client) or Buffer (server). */
export async function extractExifFromSource(source: ExifSource): Promise<ExifMetadata> {
  try {
    const [dateTime, gps] = await Promise.all([readDateTime(source), readGps(source)]);
    return {
      dateTime,
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
    };
  } catch {
    return { ...EMPTY_EXIF };
  }
}

/**
 * Extract EXIF metadata from an image file entirely on the client.
 * Uses exifr — no server upload required for metadata parsing.
 */
export async function extractExifFromFile(file: File): Promise<ExifMetadata> {
  return extractExifFromSource(file);
}

/** Server-side helper for uploaded image bytes. */
export async function extractExifFromBuffer(buffer: Buffer): Promise<ExifMetadata> {
  return extractExifFromSource(buffer);
}

/** Prefer client metadata but fill missing GPS/date from file bytes. */
export function mergeExifMetadata(
  client: Partial<ExifMetadata>,
  fromFile: ExifMetadata
): ExifMetadata {
  return {
    dateTime: client.dateTime ?? fromFile.dateTime,
    latitude: client.latitude ?? fromFile.latitude,
    longitude: client.longitude ?? fromFile.longitude,
  };
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
