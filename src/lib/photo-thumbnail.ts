import sharp from "sharp";
import {
  getMediaStore,
  getTravelFile,
  mediaKey,
  thumbMediaKey,
} from "@/lib/media-store";
import { normalizeImageForStorage } from "@/lib/photo-storage";

export const THUMB_MAX_WIDTH = 480;
export const THUMB_JPEG_QUALITY = 72;

export function thumbFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "");
  return `${base}.thumb.jpg`;
}

/** @deprecated Prefer thumbMediaKey. */
export function thumbDirPath(travelId: string): string {
  return `uploads/${travelId}/thumbs`;
}

/** @deprecated Prefer thumbMediaKey. */
export function thumbFilePath(travelId: string, filename: string): string {
  return thumbMediaKey(travelId, filename);
}

export async function thumbFileExists(
  travelId: string,
  filename: string
): Promise<boolean> {
  return getMediaStore().exists(thumbMediaKey(travelId, filename));
}

async function buildThumbBuffer(sourceBuffer: Buffer): Promise<Buffer> {
  return sharp(sourceBuffer)
    .rotate()
    .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
    .catch(async () =>
      sharp({
        create: {
          width: THUMB_MAX_WIDTH,
          height: Math.round(THUMB_MAX_WIDTH * 0.75),
          channels: 3,
          background: "#e7e5e4",
        },
      })
        .jpeg({ quality: THUMB_JPEG_QUALITY })
        .toBuffer()
    );
}

/** Genera miniatura JPEG optimizada para la UI (no usar en export). */
export async function generateThumbnail(
  sourceBuffer: Buffer,
  travelId: string,
  filename: string
): Promise<string> {
  const thumbName = thumbFilename(filename);
  const thumbBuffer = await buildThumbBuffer(sourceBuffer);
  await getMediaStore().put(thumbMediaKey(travelId, filename), thumbBuffer, {
    contentType: "image/jpeg",
    overwrite: true,
  });
  return thumbName;
}

/** Lee miniatura del store o la genera desde el original (fotos legacy). */
export async function ensureThumbnailBuffer(
  travelId: string,
  filename: string,
  fullBuffer: Buffer,
  originalExt: string
): Promise<Buffer> {
  const key = thumbMediaKey(travelId, filename);
  const existing = await getMediaStore().get(key);
  if (existing) return existing;

  const legacy = await getTravelFile(
    travelId,
    `thumbs/${thumbFilename(filename)}`
  );
  if (legacy) return legacy;

  let buffer = fullBuffer;
  if (/\.(heic|heif)$/i.test(filename) || /\.(heic|heif)$/i.test(originalExt)) {
    const normalized = await normalizeImageForStorage(fullBuffer, originalExt);
    buffer = Buffer.from(normalized.buffer);
  }

  await generateThumbnail(buffer, travelId, filename);
  return (await getMediaStore().get(key)) ?? buffer;
}

export async function deleteThumbnailFile(
  travelId: string,
  filename: string
): Promise<void> {
  await getMediaStore().delete(thumbMediaKey(travelId, filename));
}

export async function readOriginalPhotoBuffer(
  travelId: string,
  filename: string
): Promise<Buffer | null> {
  return getMediaStore().get(mediaKey(travelId, filename));
}
