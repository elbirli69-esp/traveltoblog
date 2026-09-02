import exifr from "exifr";
import type { ExifMetadata } from "@/types";
export { isImageFile, isVideoFile, isMediaFile } from "@/lib/media-types";

const EMPTY_EXIF: ExifMetadata = { dateTime: null, latitude: null, longitude: null };

type ExifSource = Blob | ArrayBuffer | Buffer;

async function toArrayBuffer(source: ExifSource): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return source;
  if (Buffer.isBuffer(source)) {
    return Uint8Array.from(source).buffer;
  }
  return source.arrayBuffer();
}

function normalizeExifOffset(offset?: string | null): string | null {
  if (!offset || typeof offset !== "string") return null;
  const trimmed = offset.trim();
  if (/^[+-]\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  const compact = trimmed.match(/^([+-])(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}${compact[2]}:${compact[3]}`;
  return null;
}

/**
 * EXIF DateTimeOriginal is wall-clock time (often without timezone).
 * When OffsetTimeOriginal is present, use it. Otherwise interpret in local runtime TZ
 * (correct on the user's device; server should prefer client-provided dateTime).
 */
export function parseExifWallClock(
  raw: unknown,
  offset?: string | null
): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw;
  }
  if (typeof raw !== "string" || !raw.trim()) return null;

  const tiff = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (tiff) {
    const [, ys, mos, ds, hs, mis, ss] = tiff;
    const wall = `${ys}-${mos}-${ds}T${hs}:${mis}:${ss}`;
    const normalizedOffset = normalizeExifOffset(offset);
    if (normalizedOffset) {
      const parsed = new Date(`${wall}${normalizedOffset}`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const y = Number(ys);
    const mo = Number(mos);
    const d = Number(ds);
    const h = Number(hs);
    const mi = Number(mis);
    const s = Number(ss);
    return new Date(y, mo - 1, d, h, mi, s);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseExifDate(rawDate: unknown, offset?: string | null): Date | null {
  return parseExifWallClock(rawDate, offset);
}

/** Android photo picker often sends 0/0 rationals → NaN. Treat as missing GPS. */
export function sanitizeGpsCoordinate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function sanitizeGpsPair(
  lat: unknown,
  lng: unknown
): { latitude: number | null; longitude: number | null } {
  const latitude = sanitizeGpsCoordinate(lat);
  const longitude = sanitizeGpsCoordinate(lng);
  if (latitude === null || longitude === null) {
    return { latitude: null, longitude: null };
  }
  if (latitude === 0 && longitude === 0) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

export function isValidGps(
  lat: number | null | undefined,
  lng: number | null | undefined
): boolean {
  const pair = sanitizeGpsPair(lat, lng);
  return pair.latitude !== null && pair.longitude !== null;
}

export function formatGpsCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined
): string | null {
  const pair = sanitizeGpsPair(lat, lng);
  if (!isValidGps(pair.latitude, pair.longitude)) return null;
  return `${pair.latitude!.toFixed(4)}, ${pair.longitude!.toFixed(4)}`;
}

export function sanitizeExifMetadata(exif: ExifMetadata): ExifMetadata {
  const gps = sanitizeGpsPair(exif.latitude, exif.longitude);
  return {
    dateTime: exif.dateTime,
    latitude: gps.latitude,
    longitude: gps.longitude,
  };
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
        tiff: true,
        reviveValues: true,
      }),
    () =>
      exifr.parse(input, {
        pick: [
          "latitude",
          "longitude",
          "GPSLatitude",
          "GPSLongitude",
          "GPSLatitudeRef",
          "GPSLongitudeRef",
        ],
        gps: true,
        tiff: true,
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

function parseDmsCoord(parts: unknown, ref: unknown): number | null {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const nums = parts.map((v) => (typeof v === "number" ? v : Number(v)));
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const [deg, min, sec] = nums;
  if (deg === 0 && min === 0 && sec === 0) return null;
  let decimal = deg + min / 60 + sec / 3600;
  const hemisphere = String(ref ?? "").toUpperCase();
  if (hemisphere === "S" || hemisphere === "W") decimal *= -1;
  return decimal;
}

function normalizeGpsResult(
  result: unknown
): { latitude: number; longitude: number } | null {
  if (!result || typeof result !== "object") return null;

  const data = result as Record<string, unknown>;
  const direct = sanitizeGpsPair(
    data.latitude ?? data.GPSLatitude,
    data.longitude ?? data.GPSLongitude
  );
  if (direct.latitude !== null && direct.longitude !== null) {
    return { latitude: direct.latitude, longitude: direct.longitude };
  }

  const lat = parseDmsCoord(data.GPSLatitude, data.GPSLatitudeRef);
  const lng = parseDmsCoord(data.GPSLongitude, data.GPSLongitudeRef);
  const dms = sanitizeGpsPair(lat, lng);
  if (dms.latitude === null || dms.longitude === null) return null;
  return { latitude: dms.latitude, longitude: dms.longitude };
}

async function readDateTime(source: ExifSource): Promise<Date | null> {
  const input = await toArrayBuffer(source);
  const dateTime = await exifr
    .parse(input, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate", "OffsetTimeOriginal"],
      reviveValues: false,
    })
    .catch(() => null);

  const rawDate =
    dateTime?.DateTimeOriginal ?? dateTime?.CreateDate ?? dateTime?.ModifyDate;
  const offset = dateTime?.OffsetTimeOriginal as string | undefined;
  return parseExifDate(rawDate, offset);
}

/** True when GPS IFD exists but coordinates were redacted (typical Android photo picker). */
export async function wasAndroidGpsStripped(source: ExifSource): Promise<boolean> {
  try {
    const input = await toArrayBuffer(source);
    const parsed = await exifr
      .parse(input, {
        pick: ["GPSLatitude", "GPSLongitude", "latitude", "longitude"],
        gps: true,
        tiff: true,
        reviveValues: true,
      })
      .catch(() => null);

    if (!parsed || typeof parsed !== "object") return false;

    const data = parsed as Record<string, unknown>;
    const hasGpsIfd =
      "GPSLatitude" in data || "GPSLongitude" in data || "latitude" in data;
    if (!hasGpsIfd) return false;

    return !isValidGps(
      data.latitude as number | null,
      data.longitude as number | null
    );
  } catch {
    return false;
  }
}

/** Extract EXIF from a Blob/File (client) or Buffer (server). */
export async function extractExifFromSource(source: ExifSource): Promise<ExifMetadata> {
  try {
    const [dateTime, gps] = await Promise.all([readDateTime(source), readGps(source)]);
    return sanitizeExifMetadata({
      dateTime,
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
    });
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

/** Prefer EXIF embedded in file bytes over client-side reads (Android often strips GPS in the browser). */
export function mergeExifMetadata(
  client: Partial<ExifMetadata>,
  fromFile: ExifMetadata
): ExifMetadata {
  const clientGps = sanitizeGpsPair(client.latitude, client.longitude);
  const fileGps = sanitizeGpsPair(fromFile.latitude, fromFile.longitude);
  return sanitizeExifMetadata({
    // Client date was parsed on the user's device (correct TZ). Server re-read uses UTC runtime.
    dateTime: client.dateTime ?? fromFile.dateTime ?? null,
    latitude: fileGps.latitude ?? clientGps.latitude,
    longitude: fileGps.longitude ?? clientGps.longitude,
  });
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
